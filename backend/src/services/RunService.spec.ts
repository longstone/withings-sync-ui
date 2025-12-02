import { RunService, CreateRunData, UpdateRunData } from './RunService'
import { RunMode, RunStatus } from '../types/enums'
import { logger, RunLogger } from '../utils/logger'
import { existsSync, unlinkSync } from 'node:fs'

// Mock all dependencies
jest.mock('../db/prisma', () => ({
    __esModule: true,
    default: {
        syncRun: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            deleteMany: jest.fn()
        }
    }
}))

jest.mock('../utils/logger', () => ({
    logger: {
        createRunLogger: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    },
    RunLogger: jest.fn().mockImplementation((runId, logFilePath) => ({
        readRunLogs: jest.fn().mockReturnValue(['log line 1', 'log line 2'])
    }))
}))
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn()
}))

const mockPrisma = require('../db/prisma').default
const mockFs = jest.mocked(require('fs'))

describe('RunService', () => {
    let runService: RunService
    let mockRunLogger: jest.Mocked<RunLogger>

    beforeEach(() => {
        jest.clearAllMocks()
        runService = new RunService()
        
        mockRunLogger = {
            readRunLogs: jest.fn()
        } as any
        
        jest.spyOn(logger, 'createRunLogger').mockReturnValue(mockRunLogger)
    })

    describe('getAllRuns', () => {
        it('should fetch all runs with profile data', async () => {
            const mockRuns = [
                { id: 'run1', syncProfile: { name: 'Profile 1' } },
                { id: 'run2', syncProfile: { name: 'Profile 2' } }
            ]
            
            ;(mockPrisma.syncRun.findMany as jest.Mock).mockResolvedValue(mockRuns)
            
            const result = await runService.getAllRuns()
            
            expect(mockPrisma.syncRun.findMany).toHaveBeenCalledWith({
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: { startedAt: 'desc' }
            })
            expect(result).toEqual(mockRuns)
        })

        it('should handle errors when fetching all runs', async () => {
            const error = new Error('Database error')
            ;(mockPrisma.syncRun.findMany as jest.Mock).mockRejectedValue(error)
            
            await expect(runService.getAllRuns()).rejects.toThrow(error)
            expect(logger.error).toHaveBeenCalledWith('Failed to fetch all runs')
        })
    })

    describe('getRunById', () => {
        it('should fetch a run by ID', async () => {
            const runId = 'run123'
            const mockRun = { id: runId, syncProfile: { name: 'Test Profile' } }
            
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            
            const result = await runService.getRunById(runId)
            
            expect(mockPrisma.syncRun.findUnique).toHaveBeenCalledWith({
                where: { id: runId },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })
            expect(result).toEqual(mockRun)
        })

        it('should handle errors when fetching run by ID', async () => {
            const runId = 'run123'
            const error = new Error('Database error')
            
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockRejectedValue(error)
            
            await expect(runService.getRunById(runId)).rejects.toThrow(error)
            expect(logger.error).toHaveBeenCalledWith(`Failed to fetch run ${runId}`)
        })
    })

    describe('getRunLogLevel', () => {
        it('should return the log level for a run', () => {
            const runId = 'run123'
            runService['runLogLevels'].set(runId, 'debug')
            
            const result = runService.getRunLogLevel(runId)
            
            expect(result).toBe('debug')
        })

        it('should return undefined for unknown run', () => {
            const result = runService.getRunLogLevel('unknown')
            expect(result).toBeUndefined()
        })
    })

    describe('getRunsByProfileId', () => {
        it('should fetch runs for a specific profile', async () => {
            const profileId = 'profile123'
            const mockRuns = [
                { id: 'run1', syncProfileId: profileId },
                { id: 'run2', syncProfileId: profileId }
            ]
            
            ;(mockPrisma.syncRun.findMany as jest.Mock).mockResolvedValue(mockRuns)
            
            const result = await runService.getRunsByProfileId(profileId)
            
            expect(mockPrisma.syncRun.findMany).toHaveBeenCalledWith({
                where: { syncProfileId: profileId },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: { startedAt: 'desc' }
            })
            expect(result).toEqual(mockRuns)
        })
    })

    describe('createRun', () => {
        it('should create a new run', async () => {
            const createData: CreateRunData = {
                syncProfileId: 'profile123',
                mode: RunMode.MANUAL,
                logLevel: 'debug'
            }
            const mockRun = { id: 'run123', ...createData, status: RunStatus.PENDING }
            
            ;(mockPrisma.syncRun.create as jest.Mock).mockResolvedValue(mockRun)
            
            const result = await runService.createRun(createData)
            
            expect(mockPrisma.syncRun.create).toHaveBeenCalledWith({
                data: {
                    syncProfileId: createData.syncProfileId,
                    mode: createData.mode,
                    status: RunStatus.PENDING
                },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })
            expect(runService.getRunLogLevel('run123')).toBe('debug')
            expect(result).toEqual(mockRun)
        })

        it('should use default log level when not provided', async () => {
            const createData: CreateRunData = {
                syncProfileId: 'profile123',
                mode: RunMode.CRON
            }
            const mockRun = { id: 'run123', ...createData, status: RunStatus.PENDING }
            
            ;(mockPrisma.syncRun.create as jest.Mock).mockResolvedValue(mockRun)
            
            await runService.createRun(createData)
            
            expect(runService.getRunLogLevel('run123')).toBe('info')
        })
    })

    describe('updateRun', () => {
        it('should update a run', async () => {
            const runId = 'run123'
            const updateData: UpdateRunData = {
                status: RunStatus.SUCCESS,
                exitCode: 0
            }
            const mockRun = { id: runId, ...updateData }
            
            ;(mockPrisma.syncRun.update as jest.Mock).mockResolvedValue(mockRun)
            
            const result = await runService.updateRun(runId, updateData)
            
            expect(mockPrisma.syncRun.update).toHaveBeenCalledWith({
                where: { id: runId },
                data: updateData,
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })
            expect(result).toEqual(mockRun)
        })
    })

    describe('startRun', () => {
        const runId = 'run123'
        const profileId = 'profile123'
        const mockRun = { id: runId, syncProfileId: profileId, status: RunStatus.PENDING }

        it('should start a run and mark profile as running', async () => {
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            ;(mockPrisma.syncRun.update as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.RUNNING })
            
            const result = await runService.startRun(runId)
            
            expect(runService.getRunningProfileIds()).toContain(profileId)
            expect(mockPrisma.syncRun.update).toHaveBeenCalledWith({
                where: { id: runId },
                data: {
                    status: RunStatus.RUNNING,
                    startedAt: expect.any(Date)
                },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })
        })

        it('should throw error if run not found', async () => {
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(null)
            
            await expect(runService.startRun(runId)).rejects.toThrow(`Run ${runId} not found`)
        })

        it('should throw error if profile is already running', async () => {
            runService['runningProfileIds'].add(profileId)
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            
            await expect(runService.startRun(runId)).rejects.toThrow(`Profile ${profileId} is already running`)
        })
    })

    describe('completeRun', () => {
        const runId = 'run123'
        const profileId = 'profile123'
        const mockRun = { id: runId, syncProfileId: profileId, status: RunStatus.RUNNING }

        beforeEach(() => {
            runService['runningProfileIds'].add(profileId)
            runService['runLogLevels'].set(runId, 'debug')
        })

        it('should complete a run and release profile lock', async () => {
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            ;(mockPrisma.syncRun.update as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.SUCCESS })
            
            const result = await runService.completeRun(runId, RunStatus.SUCCESS, 0)
            
            expect(runService.getRunningProfileIds()).not.toContain(profileId)
            expect(runService.getRunLogLevel(runId)).toBeUndefined()
            expect(mockPrisma.syncRun.update).toHaveBeenCalledWith({
                where: { id: runId },
                data: {
                    status: RunStatus.SUCCESS,
                    exitCode: 0,
                    errorMessage: undefined,
                    finishedAt: expect.any(Date)
                },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })
        })

        it('should handle completion with error message', async () => {
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            ;(mockPrisma.syncRun.update as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.FAILED })
            
            await runService.completeRun(runId, RunStatus.FAILED, 1, 'Test error')
            
            expect(mockPrisma.syncRun.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: RunStatus.FAILED,
                        exitCode: 1,
                        errorMessage: 'Test error'
                    })
                })
            )
        })
    })

    describe('failRun and succeedRun', () => {
        it('should fail a run', async () => {
            const runId = 'run123'
            const mockRun = { id: runId, syncProfileId: 'profile123', status: RunStatus.RUNNING }
            
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            ;(mockPrisma.syncRun.update as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.FAILED })
            
            jest.spyOn(runService, 'completeRun').mockResolvedValue({} as any)
            
            await runService.failRun(runId, 'Test error', 1)
            
            expect(runService.completeRun).toHaveBeenCalledWith(runId, RunStatus.FAILED, 1, 'Test error')
        })

        it('should succeed a run', async () => {
            const runId = 'run123'
            const mockRun = { id: runId, syncProfileId: 'profile123', status: RunStatus.RUNNING }
            
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            ;(mockPrisma.syncRun.update as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.SUCCESS })
            
            jest.spyOn(runService, 'completeRun').mockResolvedValue({} as any)
            
            await runService.succeedRun(runId, 0)
            
            expect(runService.completeRun).toHaveBeenCalledWith(runId, RunStatus.SUCCESS, 0)
        })
    })

    describe('isProfileRunning', () => {
        it('should return true if profile is running', async () => {
            const profileId = 'profile123'
            ;(mockPrisma.syncRun.findFirst as jest.Mock).mockResolvedValue({ id: 'run1', status: RunStatus.RUNNING })
            jest.spyOn(runService, 'cleanupStaleRuns').mockResolvedValue(0)
            
            const result = await runService.isProfileRunning(profileId)
            
            expect(result).toBe(true)
        })

        it('should return false if profile is not running', async () => {
            const profileId = 'profile123'
            ;(mockPrisma.syncRun.findFirst as jest.Mock).mockResolvedValue(null)
            jest.spyOn(runService, 'cleanupStaleRuns').mockResolvedValue(0)
            
            const result = await runService.isProfileRunning(profileId)
            
            expect(result).toBe(false)
        })
    })

    describe('getRunningRunForProfile', () => {
        it('should get the running run for a profile', async () => {
            const profileId = 'profile123'
            const mockRun = { id: 'run1', syncProfileId: profileId, status: RunStatus.RUNNING }
            
            ;(mockPrisma.syncRun.findFirst as jest.Mock).mockResolvedValue(mockRun)
            
            const result = await runService.getRunningRunForProfile(profileId)
            
            expect(mockPrisma.syncRun.findFirst).toHaveBeenCalledWith({
                where: {
                    syncProfileId: profileId,
                    status: RunStatus.RUNNING
                },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })
            expect(result).toEqual(mockRun)
        })
    })

    describe('getRunningProfileIds', () => {
        it('should return array of running profile IDs', () => {
            runService['runningProfileIds'].add('profile1')
            runService['runningProfileIds'].add('profile2')
            
            const result = runService.getRunningProfileIds()
            
            expect(result).toEqual(['profile1', 'profile2'])
        })
    })

    describe('getRunLogs', () => {
        it('should get run logs', async () => {
            const runId = 'run123'
            const mockRun = { id: runId, logFilePath: '/path/to/log.log' }
            const mockLogs = ['log line 1', 'log line 2']
            
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            
            const result = await runService.getRunLogs(runId)
            
            expect(result).toEqual(mockLogs)
        })

        it('should return empty array if run has no log file', async () => {
            const runId = 'run123'
            const mockRun = { id: runId, logFilePath: null }
            
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            
            const result = await runService.getRunLogs(runId)
            
            expect(result).toEqual([])
        })
    })

    describe('createRunLogger', () => {
        it('should create a run logger', () => {
            const runId = 'run123'
            
            const result = runService.createRunLogger(runId)
            
            expect(logger.createRunLogger).toHaveBeenCalledWith(runId)
            expect(result).toBe(mockRunLogger)
        })
    })

    describe('getRecentRuns', () => {
        it('should get recent runs with default limit', async () => {
            const mockRuns = [{ id: 'run1' }, { id: 'run2' }]
            
            ;(mockPrisma.syncRun.findMany as jest.Mock).mockResolvedValue(mockRuns)
            
            const result = await runService.getRecentRuns()
            
            expect(mockPrisma.syncRun.findMany).toHaveBeenCalledWith({
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: { startedAt: 'desc' },
                take: 50
            })
            expect(result).toEqual(mockRuns)
        })

        it('should get recent runs with custom limit', async () => {
            const mockRuns = [{ id: 'run1' }]
            
            ;(mockPrisma.syncRun.findMany as jest.Mock).mockResolvedValue(mockRuns)
            
            await runService.getRecentRuns(10)
            
            expect(mockPrisma.syncRun.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 10 })
            )
        })
    })

    describe('getRunsByStatus', () => {
        it('should get runs by status', async () => {
            const status = RunStatus.SUCCESS
            const mockRuns = [{ id: 'run1', status }]
            
            ;(mockPrisma.syncRun.findMany as jest.Mock).mockResolvedValue(mockRuns)
            
            const result = await runService.getRunsByStatus(status)
            
            expect(mockPrisma.syncRun.findMany).toHaveBeenCalledWith({
                where: { status },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: { startedAt: 'desc' }
            })
            expect(result).toEqual(mockRuns)
        })
    })

    describe('cleanupOldRuns', () => {
        it('should clean up old runs and their log files', async () => {
            const mockRuns = [
                { id: 'run1', logFilePath: '/path/to/log1.log' },
                { id: 'run2', logFilePath: '/path/to/log2.log' },
                { id: 'run3', logFilePath: null }
            ]
            
            mockFs.existsSync.mockReturnValue(true)
            ;(mockPrisma.syncRun.findMany as jest.Mock).mockResolvedValue(mockRuns)
            ;(mockPrisma.syncRun.deleteMany as jest.Mock).mockResolvedValue({ count: 3 })
            
            const result = await runService.cleanupOldRuns(30)
            
            expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2)
            expect(mockPrisma.syncRun.deleteMany).toHaveBeenCalledWith({
                where: {
                    startedAt: {
                        lt: expect.any(Date)
                    },
                    status: {
                        in: [RunStatus.SUCCESS, RunStatus.FAILED]
                    }
                }
            })
            expect(result).toEqual({ deletedRuns: 3, deletedLogFiles: 2 })
        })
    })

    describe('cleanupStaleRuns', () => {
        it('should mark stale runs as failed', async () => {
            ;(mockPrisma.syncRun.updateMany as jest.Mock).mockResolvedValue({ count: 2 })
            
            const result = await runService.cleanupStaleRuns()
            
            expect(mockPrisma.syncRun.updateMany).toHaveBeenCalledWith({
                where: {
                    status: RunStatus.RUNNING,
                    startedAt: {
                        lt: expect.any(Date)
                    }
                },
                data: {
                    status: RunStatus.FAILED,
                    finishedAt: expect.any(Date),
                    errorMessage: `Run timed out after ${RunService['RUN_TIMEOUT_MS'] / 60000} minutes`
                }
            })
            expect(result).toBe(2)
        })
    })

    describe('cancelRun', () => {
        const runId = 'run123'
        const profileId = 'profile123'
        const mockRun = { id: runId, syncProfileId: profileId, status: RunStatus.RUNNING }

        it('should cancel a running run', async () => {
            runService['runningProfileIds'].add(profileId)
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(mockRun)
            ;(mockPrisma.syncRun.update as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.FAILED })
            
            const result = await runService.cancelRun(runId)
            
            expect(runService.getRunningProfileIds()).not.toContain(profileId)
            expect(mockPrisma.syncRun.update).toHaveBeenCalledWith({
                where: { id: runId },
                data: {
                    status: RunStatus.FAILED,
                    finishedAt: expect.any(Date),
                    errorMessage: 'Run cancelled by user'
                }
            })
            expect(result).toEqual({ ...mockRun, status: RunStatus.FAILED })
        })

        it('should throw error if run not found', async () => {
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue(null)
            
            await expect(runService.cancelRun(runId)).rejects.toThrow(`Run ${runId} not found`)
        })

        it('should throw error if run is not running', async () => {
            ;(mockPrisma.syncRun.findUnique as jest.Mock).mockResolvedValue({ ...mockRun, status: RunStatus.SUCCESS })
            
            await expect(runService.cancelRun(runId)).rejects.toThrow(
                `Cannot cancel run ${runId}: status is ${RunStatus.SUCCESS}`
            )
        })
    })
})
