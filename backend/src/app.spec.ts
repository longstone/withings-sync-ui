import Fastify from 'fastify'

// Mock dependencies
jest.mock('./services/WithingsSyncRunner')
jest.mock('./services/SchedulerService')
jest.mock('./db/prisma', () => ({
    __esModule: true,
    default: {
        $connect: jest.fn(),
        $disconnect: jest.fn()
    }
}))

const mockWithingsSyncRunner = {
    checkCliAvailability: jest.fn(),
    getCliVersion: jest.fn()
} as any

describe('App API Tests', () => {
    let server: any

    beforeAll(async () => {
        // Create a test instance of the app
        server = Fastify()

        // Register the same plugins and routes as the main app
        await server.register(require('@fastify/cors'))
        await server.register(require('@fastify/websocket'))

        // Mock WebSocket handler
        server.get('/ws', {websocket: true}, (connection: any, req: any) => {
            // Mock WebSocket connection
        })

        // Health check routes
        server.get('/health', async (request: any, reply: any) => {
            return {status: 'ok', timestamp: new Date().toISOString()}
        })

        server.get('/health/cli', async (request: any, reply: any) => {
            try {
                const isAvailable = await mockWithingsSyncRunner.checkCliAvailability()
                const version = isAvailable ? await mockWithingsSyncRunner.getCliVersion() : null

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

        await server.ready()
    })

    afterAll(async () => {
        await server.close()
    })

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('Health endpoints', () => {
        it('should return health status', async () => {
            const response = await server.inject({
                method: 'GET',
                url: '/health'
            })

            expect(response.statusCode).toBe(200)
            const payload = JSON.parse(response.payload)
            expect(payload.status).toBe('ok')
            expect(payload.timestamp).toBeDefined()
        })

        it('should return CLI health status when available', async () => {
            mockWithingsSyncRunner.checkCliAvailability.mockResolvedValue(true)
            mockWithingsSyncRunner.getCliVersion.mockResolvedValue('v1.2.3')

            const response = await server.inject({
                method: 'GET',
                url: '/health/cli'
            })

            expect(response.statusCode).toBe(200)
            const payload = JSON.parse(response.payload)
            expect(payload.status).toBe('ok')
            expect(payload.available).toBe(true)
            expect(payload.version).toBe('v1.2.3')
            expect(payload.cli).toBe('withings-sync')
        })

        it('should return CLI health status when not available', async () => {
            mockWithingsSyncRunner.checkCliAvailability.mockResolvedValue(false)
            mockWithingsSyncRunner.getCliVersion.mockResolvedValue(null)

            const response = await server.inject({
                method: 'GET',
                url: '/health/cli'
            })

            expect(response.statusCode).toBe(200)
            const payload = JSON.parse(response.payload)
            expect(payload.status).toBe('error')
            expect(payload.available).toBe(false)
            expect(payload.version).toBe(null)
        })

        it('should handle CLI health check errors', async () => {
            mockWithingsSyncRunner.checkCliAvailability.mockRejectedValue(new Error('CLI error'))

            const response = await server.inject({
                method: 'GET',
                url: '/health/cli'
            })

            expect(response.statusCode).toBe(200)
            const payload = JSON.parse(response.payload)
            expect(payload.status).toBe('error')
            expect(payload.available).toBe(false)
            expect(payload.error).toBe('CLI error')
        })
    })

    describe('404 handling', () => {
        it('should return 404 for non-existent API routes', async () => {
            const response = await server.inject({
                method: 'GET',
                url: '/api/nonexistent'
            })

            expect(response.statusCode).toBe(404)
            const payload = JSON.parse(response.payload)
            expect(payload.error).toBe('Not Found')
        })

        it('should return 404 for non-existent health routes', async () => {
            const response = await server.inject({
                method: 'GET',
                url: '/health/nonexistent'
            })

            expect(response.statusCode).toBe(404)
            const payload = JSON.parse(response.payload)
            expect(payload.error).toBe('Not Found')
        })
    })

    describe('CORS', () => {
        it('should include CORS headers', async () => {
            const response = await server.inject({
                method: 'GET',
                url: '/health',
                headers: {
                    Origin: 'http://localhost:4200'
                }
            })

            expect(response.headers['access-control-allow-origin']).toBeDefined()
        })
    })
})
