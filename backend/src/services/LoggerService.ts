import {appendFileSync, existsSync} from 'fs'
import {join} from 'path'
import {LogDirectoryService} from "@/services/LogDirectoryService";

// Fastify logger interface (minimal)
export interface FastifyLogger {
    info: (msg: string, ...args: any[]) => void
    warn: (msg: string, ...args: any[]) => void
    error: (msg: string, ...args: any[]) => void
    debug: (msg: string, ...args: any[]) => void
}

export interface LogEntry {
    timestamp: string
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
    message: string
    runId?: string
    sessionId?: string
}

export class LoggerService {
    protected logDir: string
    private logFile: string
    private fastifyLogger?: FastifyLogger

    constructor(private logDirectoryService: LogDirectoryService) {

        logDirectoryService.provideLogDirectory()
        this.logDir = logDirectoryService.getLogDirectory()
        this.logFile = join(this.logDir, 'app.log');
        this.info(`logging to ${this.logFile}`);
    }

    // Set fastify logger after initialization (to avoid circular dependency)
    setFastifyLogger(fastifyLogger: FastifyLogger): void {
        this.fastifyLogger = fastifyLogger
    }

    protected writeLog(entry: LogEntry, customLogFile?: string): void {
        const logLine = JSON.stringify(entry) + '\n'
        const targetFile = customLogFile || this.logFile

        try {
            appendFileSync(targetFile, logLine, 'utf8')
        } catch (error) {
            // Use fastify logger if available, otherwise fall back to console
            if (this.fastifyLogger) {
                this.fastifyLogger.error('Failed to write to log file:', error)
                this.fastifyLogger.info(`[${entry.timestamp}] ${entry.level}: ${entry.message}`)
            } else {
                console.error('Failed to write to log file:', error)
                // Fallback to console
                console.log(`[${entry.timestamp}] ${entry.level}: ${entry.message}`)
            }
        }

        // Also log to Fastify logger for console output (visible in Docker logs)
        if (this.fastifyLogger) {
            switch (entry.level) {
                case 'INFO':
                    this.fastifyLogger.info(entry.message)
                    break
                case 'WARN':
                    this.fastifyLogger.warn(entry.message)
                    break
                case 'ERROR':
                    this.fastifyLogger.error(entry.message)
                    break
                case 'DEBUG':
                    this.fastifyLogger.debug(entry.message)
                    break
            }
        } else {
            // Fallback to console when Fastify logger isn't set yet (e.g., during construction)
            console.log(`${entry.level}: ${entry.message}`)
        }
    }

    info(message: string, runId?: string, sessionId?: string): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message,
            runId,
            sessionId
        }
        this.writeLog(entry)
    }

    warn(message: string, runId?: string, sessionId?: string): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'WARN',
            message,
            runId,
            sessionId
        }
        this.writeLog(entry)
    }

    error(message: string, runId?: string, sessionId?: string): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message,
            runId,
            sessionId
        }
        this.writeLog(entry)
    }

    debug(message: string, runId?: string, sessionId?: string): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'DEBUG',
            message,
            runId,
            sessionId
        }
        this.writeLog(entry)
    }

    // Create a run-specific log file
    createRunLogger(runId: string): RunLogger {
        const runLogFile = join(this.logDir, `${runId}.log`)
        return new RunLogger(this.logDirectoryService, runId, runLogFile)
    }

    // Read logs from a specific run
    readRunLogs(runId: string): string[] {
        const runLogFile = join(this.logDir, `${runId}.log`)

        if (!existsSync(runLogFile)) {
            return []
        }

        try {
            const fs = require('fs')
            const content = fs.readFileSync(runLogFile, 'utf8')
            return content.split('\n').filter((line: string) => line.trim())
        } catch (error) {
            console.error(`Failed to read run logs for ${runId}:`, error)
            return []
        }
    }
}

export class RunLogger extends LoggerService {
    private runId: string
    private runLogFile: string

    constructor(logDirectoryService: LogDirectoryService, runId: string, runLogFile: string) {
        super(logDirectoryService) // Initialize with default log directory
        this.runId = runId
        this.runLogFile = runLogFile
    }

    // Public getter for the log file path
    getLogFilePath(): string {
        return this.runLogFile
    }

    private writeRunLog(level: LogEntry['level'], message: string): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            runId: this.runId
        }

        // Write only to run-specific file
        super.writeLog(entry, this.runLogFile)
    }

    info(message: string): void {
        this.writeRunLog('INFO', message)
    }

    warn(message: string): void {
        this.writeRunLog('WARN', message)
    }

    error(message: string): void {
        this.writeRunLog('ERROR', message)
    }

    debug(message: string): void {
        this.writeRunLog('DEBUG', message)
    }

    // Log CLI output (stdout/stderr)
    logCliOutput(data: string, isStderr: boolean = false): void {
        const level: LogEntry['level'] = isStderr ? 'ERROR' : 'INFO'
        this.writeRunLog(level, `CLI: ${data.trim()}`)
    }
}
