import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import {log} from "node:util";

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

export class Logger {
  protected logDir: string
  private logFile: string
  private fastifyLogger?: FastifyLogger
  private static instance: Logger

  constructor(logDir?: string, fastifyLogger?: FastifyLogger) {
    // Use DATA_DIR env var for consistency with crypto utility
    const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
    this.logDir = logDir || join(dataDir, 'logs')
    this.fastifyLogger = fastifyLogger
    
    // Ensure log directory exists
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
    
    // Default app log file
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
    return new RunLogger(runId, runLogFile)
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

export class RunLogger extends Logger {
  private runId: string
  private runLogFile: string

  constructor(runId: string, runLogFile: string) {
    super() // Initialize with default log directory
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

  // Read run logs from file
  readRunLogs(runId: string): string[] {
    try {
      const fs = require('fs')
      const path = require('path')
      
      const logFile = path.join(this.logDir, `${runId}.log`)
      
      if (!fs.existsSync(logFile)) {
        return []
      }

      const content = fs.readFileSync(logFile, 'utf8')
      const lines = content.split('\n').filter((line: string) => line.trim().length > 0)
      
      // Parse JSON log entries and return just the message content
      return lines.map((line: string) => {
        try {
          const parsed = JSON.parse(line)
          return `[${parsed.timestamp}] ${parsed.level}: ${parsed.message}`
        } catch {
          return line // Return raw line if parsing fails
        }
      })
    } catch (error) {
      console.error(`Failed to read run logs for ${runId}:`, error)
      return []
    }
  }
}

// Default logger instance
export const logger = new Logger()

// Helper to set fastify logger after app initialization
export function initializeLoggerWithFastify(fastifyLogger: FastifyLogger): void {
  logger.setFastifyLogger(fastifyLogger)
}
