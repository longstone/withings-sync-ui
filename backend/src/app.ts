import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import {createReadStream, existsSync, statSync} from 'fs'
import path from 'path'
import profilesRoutes from '@/routes/profiles'
import runsRoutes from '@/routes/runs'
import schedulerRoutes from '@/routes/scheduler'
import settingsRoutes from '@/routes/settings'
import {registerWebSocketHandler} from '@/ws/WebSocketHandler'
import {Services} from '@/services/Services'

// Format log message - handle objects and strings
const formatMessage = (msg: any, ...args: any[]): string => {
    if (typeof msg === 'object') {
        if (msg.req && msg.res) {
            // Fastify request/response object
            const {method, url} = msg.req
            const {statusCode} = msg.res
            return `${method} ${url} -> ${statusCode}`
        }
        // Handle circular references by using a replacer function
        try {
            return JSON.stringify(msg, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    // Skip circular references and complex objects
                    if (value.constructor && (value.constructor.name === 'Socket' ||
                        value.constructor.name === 'HTTPParser' ||
                        value.constructor.name === 'Server' ||
                        key === 'socket' || key === 'parser' || key === 'server')) {
                        return '[Object]'
                    }
                }
                return value
            }, 2)
        } catch (e) {
            return '[Object]'
        }
    }
    return String(msg)
}

// Create log methods to avoid duplication
const createLogMethods = () => ({
    info: (msg: any, ...args: any[]) => console.log(`[INFO] ${new Date().toISOString()} ${formatMessage(msg)}`, ...args),
    warn: (msg: any, ...args: any[]) => console.warn(`[WARN] ${new Date().toISOString()} ${formatMessage(msg)}`, ...args),
    error: (msg: any, ...args: any[]) => console.error(`[ERROR] ${new Date().toISOString()} ${formatMessage(msg)}`, ...args),
    debug: (msg: any, ...args: any[]) => {
        if (process.env.LOG_LEVEL === 'debug') {
            console.log(`[DEBUG] ${new Date().toISOString()} ${formatMessage(msg)}`, ...args)
        }
    },
    fatal: (msg: any, ...args: any[]) => console.error(`[FATAL] ${new Date().toISOString()} ${formatMessage(msg)}`, ...args),
    trace: (msg: any, ...args: any[]) => {
        if (process.env.LOG_LEVEL === 'trace') {
            console.log(`[TRACE] ${new Date().toISOString()} ${formatMessage(msg)}`, ...args)
        }
    },
    silent: () => {
    }, // No-op for silent
})

// Simple plain text logger
const createPlainLogger = () => {
    const logMethods = createLogMethods()

    return {
        ...logMethods,
        child: () => {
            const childLogger = {...logMethods, child: () => childLogger, level: 'info'}
            return childLogger
        },
        level: 'info' as string
    }
}

const server = Fastify({
    logger: createPlainLogger()
})

// Initialize services using manual dependency injection
const services: Services = new Services().initialize()

// Log the actual DATABASE_URL being used
services.getLogger().info('DATABASE_URL being used: ' + (process.env.DATABASE_URL || 'undefined'))

server.decorate('services', services);

// Initialize the custom logger with the fastify logger instance
services.initializeLoggerWithFastify(server.log)

// Register plugins
server.register(cors)
server.register(websocket)

// Register WebSocket handler
registerWebSocketHandler(server)

// Register routes
server.register(profilesRoutes, {prefix: '/api'})
server.register(runsRoutes, {prefix: '/api'})
server.register(schedulerRoutes, {prefix: '/api'})
server.register(settingsRoutes, {prefix: '/api'})

// Health check
server.get('/health', async () => {
    return {status: 'ok', timestamp: new Date().toISOString()}
})

// CLI health check
server.get('/health/cli', async () => {
    try {
        const isAvailable = await services.getWithingsSyncRunner().checkCliAvailability()
        const version = isAvailable ? await services.getWithingsSyncRunner().getCliVersion() : null

        return {
            status: isAvailable ? 'ok' : 'error',
            cli: 'withings-sync',
            available: isAvailable,
            version,
            timestamp: new Date().toISOString()
        }
    } catch (error) {
        return {
            status: 'error',
            cli: 'withings-sync',
            available: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }
    }
})

// Serve frontend assets (built Angular app)
const staticRoot = path.join(process.cwd(), '..', 'frontend', 'dist', 'frontend', 'browser')
const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.webp': 'image/webp'
}

server.get('/*', async (request, reply) => {
    // Let API and health routes fall through to default 404
    if (request.url.startsWith('/api') || request.url.startsWith('/health')) {
        reply.code(404)
        return {error: 'Not found'}
    }

    const wildcard = (request.params as { '*': string })['*'] || ''
    const requestedPath = wildcard.endsWith('/') || wildcard === '' ? path.join(wildcard, 'index.html') : wildcard
    const normalizedPath = path.normalize('/' + requestedPath).replace(/^(\.\.[/\\])+/, '')
    let filePath = path.join(staticRoot, normalizedPath)

    if (!filePath.startsWith(staticRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = path.join(staticRoot, 'index.html')
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    reply.type(contentType)
    return reply.send(createReadStream(filePath))
})

const start = async () => {
    try {
        // Test database connection on startup
        await services.getPrisma().$connect()
        server.log.info('Database connected successfully')

        // Initialize scheduler service
        await services.getSchedulerService().initialize()
        server.log.info('Scheduler service initialized')


        // Register graceful shutdown handlers
        const gracefulShutdown = async (signal: string) => {
            server.log.info(`Received ${signal}, starting graceful shutdown`)

            try {
                // Shutdown scheduler first
                await services.getSchedulerService().shutdown()
                server.log.info('Scheduler service shutdown')

                // Close database connection
                await services.getPrisma().$disconnect()
                server.log.info('Database disconnected')

                process.exit(0)
            } catch (error) {
                server.log.error({err: error}, 'Error during graceful shutdown')
                process.exit(1)
            }
        }

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
        process.on('SIGINT', () => gracefulShutdown('SIGINT'))

        const port = parseInt(process.env.PORT || '3333')
        const host = process.env.HOST || '0.0.0.0'
        await server.listen({port, host})
    } catch (err) {
        server.log.error({err}, 'Failed to start server')
        process.exit(1)
    }
}

start().catch(err => {
    services.getLogger().error('Failed to start application: ' + (err instanceof Error ? err.message : String(err)))
    process.exit(1)
})
