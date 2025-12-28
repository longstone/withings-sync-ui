import prisma from '@/db/prisma'
import {RunMode, RunStatus} from '@/types/enums'
import {LogDirectoryService} from '@/services/LogDirectoryService'
import {LoggerService, RunLogger} from '@/services/LoggerService'

export interface CreateRunData {
    syncProfileId: string
    mode: RunMode
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

export interface UpdateRunData {
    status?: RunStatus
    exitCode?: number
    logFilePath?: string
    errorMessage?: string
    finishedAt?: Date
}

export class RunService {
    // Track running profiles to prevent concurrent runs
    private runningProfileIds: Set<string> = new Set()
    private static readonly RUN_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes timeout
    private runLogLevels: Map<string, 'debug' | 'info' | 'warn' | 'error'> = new Map()


    constructor(private logger: LoggerService, private logDirectoryService: LogDirectoryService) {
    }

    // Get all runs
    async getAllRuns() {
        try {
            return await prisma.syncRun.findMany({
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: {startedAt: 'desc'}
            })
        } catch (error) {
            this.logger.error('Failed to fetch all runs')
            throw error
        }
    }

    // Get single run by ID
    async getRunById(id: string) {
        try {
            return await prisma.syncRun.findUnique({
                where: {id},
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })
        } catch (error) {
            this.logger.error(`Failed to fetch run ${id}`)
            throw error
        }
    }

    getRunLogLevel(id: string): 'debug' | 'info' | 'warn' | 'error' | undefined {
        return this.runLogLevels.get(id)
    }

    // Get runs for a specific profile
    async getRunsByProfileId(syncProfileId: string) {
        try {
            return await prisma.syncRun.findMany({
                where: {syncProfileId},
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: {startedAt: 'desc'}
            })
        } catch (error) {
            this.logger.error(`Failed to fetch runs for profile ${syncProfileId}`)
            throw error
        }
    }

    // Create new run
    async createRun(data: CreateRunData) {
        try {
            const run = await prisma.syncRun.create({
                data: {
                    syncProfileId: data.syncProfileId,
                    mode: data.mode,
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

            this.runLogLevels.set(run.id, data.logLevel || 'info')

            this.logger.info(`Created run ${run.id} for profile ${data.syncProfileId}`, run.id)
            return run
        } catch (error) {
            this.logger.error(`Failed to create run for profile ${data.syncProfileId}`)
            throw error
        }
    }

    // Update run
    async updateRun(id: string, data: UpdateRunData) {
        try {
            const run = await prisma.syncRun.update({
                where: {id},
                data,
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })

            this.logger.info(`Updated run ${id}`, id)
            return run
        } catch (error) {
            this.logger.error(`Failed to update run ${id}`)
            throw error
        }
    }

    // Start a run (set status to RUNNING and mark profile as running)
    async startRun(id: string) {
        try {
            // First get the run to get the profile ID
            const existingRun = await this.getRunById(id)
            if (!existingRun) {
                throw new Error(`Run ${id} not found`)
            }

            // Check if profile is already running
            if (this.runningProfileIds.has(existingRun.syncProfileId)) {
                throw new Error(`Profile ${existingRun.syncProfileId} is already running`)
            }

            // Mark profile as running
            this.runningProfileIds.add(existingRun.syncProfileId)

            // Update run status
            const run = await prisma.syncRun.update({
                where: {id},
                data: {
                    status: RunStatus.RUNNING,
                    startedAt: new Date()
                },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })

            this.logger.info(`Started run ${id}`, id)
            return run
        } catch (error) {
            this.logger.error(`Failed to start run ${id}`)
            throw error
        }
    }

    // Complete a run (set status to SUCCESS/FAILED and release profile lock)
    async completeRun(id: string, status: RunStatus, exitCode?: number, errorMessage?: string) {
        try {
            // First get the run to get the profile ID
            const existingRun = await this.getRunById(id)
            if (!existingRun) {
                throw new Error(`Run ${id} not found`)
            }

            // Release profile lock
            this.runningProfileIds.delete(existingRun.syncProfileId)

            // Update run status
            const run = await prisma.syncRun.update({
                where: {id},
                data: {
                    status,
                    exitCode,
                    errorMessage,
                    finishedAt: new Date()
                },
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                }
            })

            this.logger.info(`Completed run ${id} with status ${status}`, id)
            this.runLogLevels.delete(id)
            return run
        } catch (error) {
            this.logger.error(`Failed to complete run ${id}`)
            throw error
        }
    }

    // Fail a run (convenience method)
    async failRun(id: string, errorMessage: string, exitCode?: number) {
        return this.completeRun(id, RunStatus.FAILED, exitCode, errorMessage)
    }

    // Succeed a run (convenience method)
    async succeedRun(id: string, exitCode?: number) {
        return this.completeRun(id, RunStatus.SUCCESS, exitCode)
    }

    // Check if a profile is currently running
    async isProfileRunning(syncProfileId: string): Promise<boolean> {
        // First cleanup any stale runs
        await this.cleanupStaleRuns()

        // Check database for any running runs for this profile
        const runningRun = await prisma.syncRun.findFirst({
            where: {
                syncProfileId,
                status: RunStatus.RUNNING
            }
        })

        return !!runningRun
    }

    // Get the currently running run for a profile
    async getRunningRunForProfile(syncProfileId: string) {
        return prisma.syncRun.findFirst({
            where: {
                syncProfileId,
                status: RunStatus.RUNNING
            },
            include: {
                syncProfile: {
                    include: {
                        ownerUser: true
                    }
                }
            }
        });
    }

    // Get all currently running profile IDs
    getRunningProfileIds(): string[] {
        return Array.from(this.runningProfileIds)
    }

    // Get run logs
    async getRunLogs(id: string): Promise<string[]> {
        try {
            const run = await this.getRunById(id)
            if (!run || !run.logFilePath) {
                return []
            }

            // Use LogDirectoryService to read the logs
            return this.logDirectoryService.readRunLogs(run.syncProfileId, id)
        } catch (error) {
            this.logger.error(`Failed to read logs for run ${id}`)
            throw error
        }
    }

    createRunLogger(id: string): RunLogger {
        return this.logger.createRunLogger(id)
    }

    // Get recent runs (last N runs)
    async getRecentRuns(limit: number = 50) {
        try {
            return await prisma.syncRun.findMany({
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: {startedAt: 'desc'},
                take: limit
            })
        } catch (error) {
            this.logger.error('Failed to fetch recent runs')
            throw error
        }
    }

    // Get runs by status
    async getRunsByStatus(status: RunStatus) {
        try {
            return await prisma.syncRun.findMany({
                where: {status},
                include: {
                    syncProfile: {
                        include: {
                            ownerUser: true
                        }
                    }
                },
                orderBy: {startedAt: 'desc'}
            })
        } catch (error) {
            this.logger.error(`Failed to fetch runs with status ${status}`)
            throw error
        }
    }

    // Clean up old runs (optional maintenance)
    async cleanupOldRuns(daysOld: number = 30) {
        try {
            const cutoffDate = new Date()
            cutoffDate.setDate(cutoffDate.getDate() - daysOld)

            // First, get the runs to be deleted to clean up their log files
            const runsToDelete = await prisma.syncRun.findMany({
                where: {
                    startedAt: {
                        lt: cutoffDate
                    },
                    status: {
                        in: [RunStatus.SUCCESS, RunStatus.FAILED]
                    }
                },
                select: {
                    id: true,
                    logFilePath: true
                }
            })

            // Delete log files for runs that have them
            let deletedLogFiles = 0
            for (const run of runsToDelete) {
                if (run.logFilePath) {
                    try {
                        if (this.logDirectoryService.deleteLogFile(run.logFilePath)) {
                            deletedLogFiles++
                            this.logger.debug(`Deleted log file for run ${run.id}: ${run.logFilePath}`)
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to delete log file for run ${run.id}: ${run.logFilePath}`)
                    }
                }
            }

            // Delete the runs from database
            const result = await prisma.syncRun.deleteMany({
                where: {
                    startedAt: {
                        lt: cutoffDate
                    },
                    status: {
                        in: [RunStatus.SUCCESS, RunStatus.FAILED]
                    }
                }
            })

            this.logger.info(`Cleaned up ${result.count} old runs and ${deletedLogFiles} log files`)
            return {deletedRuns: result.count, deletedLogFiles}
        } catch (error) {
            this.logger.error('Failed to cleanup old runs')
            throw error
        }
    }

    // Clean up stale runs that have been RUNNING too long
    async cleanupStaleRuns() {
        try {
            const cutoffTime = new Date(Date.now() - RunService.RUN_TIMEOUT_MS)

            const result = await prisma.syncRun.updateMany({
                where: {
                    status: RunStatus.RUNNING,
                    startedAt: {
                        lt: cutoffTime
                    }
                },
                data: {
                    status: RunStatus.FAILED,
                    finishedAt: new Date(),
                    errorMessage: `Run timed out after ${RunService.RUN_TIMEOUT_MS / 60000} minutes`
                }
            })

            if (result.count > 0) {
                this.logger.warn(`Marked ${result.count} stale runs as failed due to timeout`)
            }

            return result.count
        } catch (error) {
            this.logger.error('Failed to cleanup stale runs')
            throw error
        }
    }

    // Cancel a run (mark as failed)
    async cancelRun(id: string) {
        try {
            const run = await this.getRunById(id)
            if (!run) {
                throw new Error(`Run ${id} not found`)
            }

            // Only allow canceling runs that are currently running
            if (run.status !== RunStatus.RUNNING) {
                throw new Error(`Cannot cancel run ${id}: status is ${run.status}`)
            }

            // Update the run to failed status
            const updatedRun = await prisma.syncRun.update({
                where: {id},
                data: {
                    status: RunStatus.FAILED,
                    finishedAt: new Date(),
                    errorMessage: 'Run cancelled by user'
                }
            })

            // Remove from running profiles set
            this.runningProfileIds.delete(run.syncProfileId)

            this.logger.info(`Run ${id} cancelled by user`)
            return updatedRun
        } catch (error) {
            this.logger.error(`Failed to cancel run ${id}: ${error}`)
            throw error
        }
    }
}
