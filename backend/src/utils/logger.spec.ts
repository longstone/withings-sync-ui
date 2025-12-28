import {Logger, logger, RunLogger} from '@/utils/logger'

// Mock fs module
jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs')
    return {
        ...actualFs,
        writeFileSync: jest.fn(),
        appendFileSync: jest.fn(),
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        readFileSync: jest.fn()
    }
})

const mockFs = jest.mocked(require('fs'))

describe('Logger', () => {
    const testLogDir = '/tmp/test-logs'

    beforeEach(() => {
        jest.clearAllMocks()
        mockFs.existsSync.mockImplementation((path: string) => {
            if (path === testLogDir) return false
            return true
        })
        mockFs.mkdirSync.mockImplementation(() => {
        })
        mockFs.appendFileSync.mockImplementation(() => {
        })
    })

    describe('constructor', () => {
        it('should use default log directory when none provided', () => {
            mockFs.existsSync.mockReturnValue(false)
            new Logger()
            expect(mockFs.existsSync).toHaveBeenCalled()
            expect(mockFs.mkdirSync).toHaveBeenCalled()
        })

        it('should use custom log directory when provided', () => {
            mockFs.existsSync.mockReturnValue(false)
            new Logger()
            expect(mockFs.existsSync).toHaveBeenCalledWith(testLogDir)
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(testLogDir, {recursive: true})
        })
    })

    describe('logging methods', () => {
        let logger: Logger

        beforeEach(() => {
            logger = new Logger(testLogDir)
        })

        it('should write info logs', () => {
            logger.info('Test info message', 'run123', 'session456')

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                expect.stringContaining('app.log'),
                expect.stringContaining('"level":"INFO","message":"Test info message","runId":"run123","sessionId":"session456"'),
                'utf8'
            )
        })

        it('should write warn logs', () => {
            logger.warn('Test warning')

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('"level":"WARN","message":"Test warning"'),
                'utf8'
            )
        })

        it('should write error logs', () => {
            logger.error('Test error', 'run123')

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('"level":"ERROR","message":"Test error","runId":"run123"'),
                'utf8'
            )
        })

        it('should write debug logs', () => {
            logger.debug('Test debug')

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('"level":"DEBUG","message":"Test debug"'),
                'utf8'
            )
        })

        it('should handle file write errors gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
            mockFs.appendFileSync.mockImplementationOnce(() => {
                throw new Error('Write failed')
            })

            logger.info('Test message')

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('INFO: Test message')
            )
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to write to log file:',
                expect.any(Error)
            )
            consoleSpy.mockRestore()
            consoleErrorSpy.mockRestore()
        })
    })

    describe('run-specific operations', () => {
        let logger: Logger
        const runId = 'test-run-123'

        beforeEach(() => {
            logger = new Logger(testLogDir)
        })

        it('should create a RunLogger instance', () => {
            const runLogger = logger.createRunLogger(runId)
            expect(runLogger).toBeInstanceOf(RunLogger)
        })

        it('should read run logs', () => {
            const mockLogs = ['{"timestamp":"2023-01-01","level":"INFO","message":"Test"}']
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readFileSync.mockReturnValue(mockLogs.join('\n'))

            const logs = logger.readRunLogs(runId)
            expect(logs).toEqual(mockLogs)
            expect(mockFs.readFileSync).toHaveBeenCalledWith(
                expect.stringContaining(`${runId}.log`),
                'utf8'
            )
        })

        it('should return empty array for non-existent run logs', () => {
            mockFs.existsSync.mockReturnValue(false)

            const logs = logger.readRunLogs('non-existent')
            expect(logs).toEqual([])
        })

        it('should handle read errors gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Read failed')
            })

            const logs = logger.readRunLogs(runId)
            expect(logs).toEqual([])
            expect(consoleSpy).toHaveBeenCalled()
            consoleSpy.mockRestore()
        })
    })
})

describe('RunLogger', () => {
    const testRunId = 'test-run-456'
    const testLogFile = '/tmp/test-run.log'
    let runLogger: RunLogger

    beforeEach(() => {
        jest.clearAllMocks()
        mockFs.existsSync.mockReturnValue(true)
        mockFs.mkdirSync.mockImplementation(() => {
        })
        mockFs.appendFileSync.mockImplementation(() => {
        })
        runLogger = new RunLogger(testRunId, testLogFile)
    })

    describe('constructor', () => {
        it('should initialize with run ID and log file', () => {
            expect(runLogger['runId']).toBe(testRunId)
            expect(runLogger['runLogFile']).toBe(testLogFile)
        })
    })

    describe('getLogFilePath', () => {
        it('should return the log file path', () => {
            expect(runLogger.getLogFilePath()).toBe(testLogFile)
        })
    })

    describe('logging methods', () => {
        it('should write info logs to both run file and main log', () => {
            runLogger.info('Test info message')

            expect(mockFs.appendFileSync).toHaveBeenCalledTimes(2)
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                testLogFile,
                expect.stringContaining('"level":"INFO","message":"Test info message","runId":"test-run-456"'),
                'utf8'
            )
        })

        it('should write warn logs to both run file and main log', () => {
            runLogger.warn('Test warning')

            expect(mockFs.appendFileSync).toHaveBeenCalledTimes(2)
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                testLogFile,
                expect.stringContaining('"level":"WARN","message":"Test warning"'),
                'utf8'
            )
        })

        it('should write error logs to both run file and main log', () => {
            runLogger.error('Test error')

            expect(mockFs.appendFileSync).toHaveBeenCalledTimes(2)
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                testLogFile,
                expect.stringContaining('"level":"ERROR","message":"Test error"'),
                'utf8'
            )
        })

        it('should write debug logs to both run file and main log', () => {
            runLogger.debug('Test debug')

            expect(mockFs.appendFileSync).toHaveBeenCalledTimes(2)
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                testLogFile,
                expect.stringContaining('"level":"DEBUG","message":"Test debug"'),
                'utf8'
            )
        })
    })

    describe('logCliOutput', () => {
        it('should log stdout as INFO', () => {
            runLogger.logCliOutput('Command output', false)

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                testLogFile,
                expect.stringContaining('"level":"INFO","message":"CLI: Command output"'),
                'utf8'
            )
        })

        it('should log stderr as ERROR', () => {
            runLogger.logCliOutput('Error output', true)

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                testLogFile,
                expect.stringContaining('"level":"ERROR","message":"CLI: Error output"'),
                'utf8'
            )
        })

        it('should trim whitespace from CLI output', () => {
            runLogger.logCliOutput('  Output with spaces  \n', false)

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                testLogFile,
                expect.stringContaining('"message":"CLI: Output with spaces"'),
                'utf8'
            )
        })
    })

    describe('readRunLogs', () => {
        it('should read and parse run logs', () => {
            const mockLogContent = [
                '{"timestamp":"2023-01-01T10:00:00.000Z","level":"INFO","message":"Test message"}',
                '{"timestamp":"2023-01-01T10:01:00.000Z","level":"ERROR","message":"Test error"}'
            ]
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readFileSync.mockReturnValue(mockLogContent.join('\n'))

            const logs = runLogger.readRunLogs(testRunId)

            expect(logs).toHaveLength(2)
            expect(logs[0]).toBe('[2023-01-01T10:00:00.000Z] INFO: Test message')
            expect(logs[1]).toBe('[2023-01-01T10:01:00.000Z] ERROR: Test error')
        })

        it('should handle malformed log lines', () => {
            const mockLogContent = [
                '{"timestamp":"2023-01-01T10:00:00.000Z","level":"INFO","message":"Valid log"}',
                'Invalid log line',
                '{"timestamp":"2023-01-01T10:01:00.000Z","level":"ERROR","message":"Another valid log"}'
            ]
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readFileSync.mockReturnValue(mockLogContent.join('\n'))

            const logs = runLogger.readRunLogs(testRunId)

            expect(logs).toHaveLength(3)
            expect(logs[0]).toBe('[2023-01-01T10:00:00.000Z] INFO: Valid log')
            expect(logs[1]).toBe('Invalid log line')
            expect(logs[2]).toBe('[2023-01-01T10:01:00.000Z] ERROR: Another valid log')
        })

        it('should return empty array for non-existent file', () => {
            mockFs.existsSync.mockReturnValue(false)

            const logs = runLogger.readRunLogs('non-existent')
            expect(logs).toEqual([])
        })

        it('should handle read errors gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('Read failed')
            })

            const logs = runLogger.readRunLogs(testRunId)
            expect(logs).toEqual([])
            expect(consoleSpy).toHaveBeenCalled()
            consoleSpy.mockRestore()
        })
    })
})

describe('Default logger', () => {
    it('should export a default logger instance', () => {
        expect(logger).toBeInstanceOf(Logger)
    })
})
