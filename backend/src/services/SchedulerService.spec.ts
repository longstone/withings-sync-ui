import { SchedulerService, SchedulerStatus } from './SchedulerService'
import { ProfileService } from './ProfileService'
import { RunService } from './RunService'
import { WithingsSyncRunner } from './WithingsSyncRunner'
import { logger } from '../utils/logger'
import { RunMode, RunStatus } from '../types/enums'
import * as schedule from 'node-schedule'
import { randomWeeklyCronOnDay, randomMinute, randomHour } from '../utils/random'

// Mock all dependencies
jest.mock('node-schedule', () => ({
    scheduleJob: jest.fn(),
    Job: jest.fn().mockImplementation(() => ({
        cancel: jest.fn(),
        nextInvocation: jest.fn(),
        schedule: { toString: jest.fn().mockReturnValue('0 0 * * *') }
    }))
}))

jest.mock('../utils/logger')
jest.mock('../utils/random', () => ({
    randomWeeklyCronOnDay: jest.fn().mockReturnValue('0 2 * * 0'),
    randomMinute: jest.fn().mockReturnValue(15),
    randomHour: jest.fn().mockReturnValue(3)
}))

const mockSchedule = require('node-schedule')

describe('SchedulerService', () => {
    let schedulerService: SchedulerService
    let mockProfileService: jest.Mocked<ProfileService>
    let mockRunService: jest.Mocked<RunService>
    let mockWithingsSyncRunner: jest.Mocked<WithingsSyncRunner>
    let setIntervalSpy: jest.SpyInstance
    let clearIntervalSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 123 as any)
        clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation()
        
        mockProfileService = {
            getScheduledProfiles: jest.fn(),
            getProfileById: jest.fn()
        } as any

        mockRunService = {
            isProfileRunning: jest.fn(),
            createRun: jest.fn(),
            getRunsByStatus: jest.fn(),
            failRun: jest.fn(),
            cleanupOldRuns: jest.fn()
        } as any

        mockWithingsSyncRunner = {
            runSync: jest.fn()
        } as any

        schedulerService = new SchedulerService(
            mockProfileService,
            mockRunService,
            mockWithingsSyncRunner
        )
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('constructor', () => {
        it('should initialize with dependencies', () => {
            expect(schedulerService['profileService']).toBe(mockProfileService)
            expect(schedulerService['runService']).toBe(mockRunService)
            expect(schedulerService['withingsSyncRunner']).toBe(mockWithingsSyncRunner)
        })
    })

    describe('initialize', () => {
        it('should initialize scheduler with all components', async () => {
            const mockProfiles = [
                { 
                    id: 'profile1', 
                    name: 'Profile 1',
                    ownerUserId: 'user123',
                    withingsConfigDir: '/config/dir',
                    garminAccountId: null,
                    trainerroadAccountId: null,
                    enabled: true, 
                    enableBloodPressure: false,
                    scheduleCron: '0 0 * * *',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    ownerUser: {
                        id: 'user123',
                        createdAt: new Date(),
                        displayName: 'Test User'
                    },
                    runs: []
                }
            ]
            
            mockProfileService.getScheduledProfiles.mockResolvedValue(mockProfiles)
            mockRunService.getRunsByStatus.mockResolvedValue([])
            jest.spyOn(schedulerService, 'scheduleProfile' as any).mockImplementation(() => Promise.resolve())
            
            await schedulerService.initialize()
            
            expect(mockRunService.getRunsByStatus).toHaveBeenCalledWith('RUNNING')
            expect(schedulerService['scheduleProfile']).toHaveBeenCalledWith('profile1', '0 0 * * *')
            expect(schedulerService['isRunning']).toBe(true)
            expect(setIntervalSpy).toHaveBeenCalled()
            expect(mockSchedule.scheduleJob).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Function)
            )
        })

        it('should handle initialization errors', async () => {
            const error = new Error('Init failed')
            mockProfileService.getScheduledProfiles.mockRejectedValue(error)
            
            await expect(schedulerService.initialize()).rejects.toThrow(error)
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to initialize scheduler',
                error.message
            )
        })
    })

    describe('resolveRandomPlaceholders', () => {
        it('should replace ? with random values', () => {
            const result = schedulerService['resolveRandomPlaceholders']('? ? * * *')
            
            expect(result).toBe('15 3 * * *')
        })

        it('should leave valid cron expression unchanged', () => {
            const result = schedulerService['resolveRandomPlaceholders']('0 12 * * *')
            
            expect(result).toBe('0 12 * * *')
        })

        it('should handle partial placeholders', () => {
            const result = schedulerService['resolveRandomPlaceholders']('? 12 * * *')
            
            expect(result).toBe('15 12 * * *')
        })
    })

    describe('scheduleProfile', () => {
        const profileId = 'profile123'
        const cronExpression = '0 0 * * *'
        const mockProfile = { 
            id: profileId, 
            name: 'Test Profile',
            ownerUserId: 'user123',
            withingsConfigDir: '/config/dir',
            garminAccountId: null,
            trainerroadAccountId: null,
            enabled: true,
            enableBloodPressure: false,
            scheduleCron: '0 0 * * *',
            createdAt: new Date(),
            updatedAt: new Date(),
            ownerUser: {
                id: 'user123',
                createdAt: new Date(),
                displayName: 'Test User'
            },
            runs: []
        }
        const mockJob = { cancel: jest.fn(), nextInvocation: jest.fn() } as any

        beforeEach(() => {
            mockProfileService.getProfileById.mockResolvedValue(mockProfile)
            mockSchedule.scheduleJob.mockReturnValue(mockJob)
        })

        it('should schedule a profile successfully', async () => {
            await schedulerService.scheduleProfile(profileId, cronExpression)
            
            expect(mockProfileService.getProfileById).toHaveBeenCalledWith(profileId)
            expect(mockSchedule.scheduleJob).toHaveBeenCalledWith(
                cronExpression,
                expect.any(Function)
            )
            expect(schedulerService['scheduledJobs'].get(profileId)).toBe(mockJob)
        })

        it('should throw error for invalid cron expression', async () => {
            const invalidCron = 'invalid cron'
            mockSchedule.scheduleJob.mockReturnValue(null)
            
            await expect(schedulerService.scheduleProfile(profileId, invalidCron))
                .rejects.toThrow(`Failed to schedule job for profile ${profileId}`)
        })

        it('should throw error if profile not found', async () => {
            mockProfileService.getProfileById.mockResolvedValue(null)
            
            await expect(schedulerService.scheduleProfile(profileId, cronExpression))
                .rejects.toThrow(`Profile ${profileId} not found`)
        })

        it('should throw error if profile is disabled', async () => {
            mockProfileService.getProfileById.mockResolvedValue({ 
                ...mockProfile, 
                enabled: false,
                ownerUser: {
                    id: 'user123',
                    createdAt: new Date(),
                    displayName: 'Test User'
                },
                runs: []
            })
            
            await expect(schedulerService.scheduleProfile(profileId, cronExpression))
                .rejects.toThrow(`Profile ${profileId} is disabled`)
        })

        it('should replace existing job', async () => {
            const oldJob = { cancel: jest.fn() } as any
            schedulerService['scheduledJobs'].set(profileId, oldJob)
            
            await schedulerService.scheduleProfile(profileId, cronExpression)
            
            expect(oldJob.cancel).toHaveBeenCalled()
        })

        it('should resolve random placeholders', async () => {
            const randomCron = '? ? * * *'
            
            await schedulerService.scheduleProfile(profileId, randomCron)
            
            expect(mockSchedule.scheduleJob).toHaveBeenCalledWith(
                '15 3 * * *',
                expect.any(Function)
            )
            expect(schedulerService['resolvedCronExpressions'].get(profileId))
                .toBe('15 3 * * *')
        })
    })

    describe('unscheduleProfile', () => {
        const profileId = 'profile123'
        const mockJob = { cancel: jest.fn() } as any

        it('should unschedule a profile', () => {
            schedulerService['scheduledJobs'].set(profileId, mockJob)
            schedulerService['resolvedCronExpressions'].set(profileId, '0 0 * * *')
            
            schedulerService.unscheduleProfile(profileId)
            
            expect(mockJob.cancel).toHaveBeenCalled()
            expect(schedulerService['scheduledJobs'].has(profileId)).toBe(false)
            expect(schedulerService['resolvedCronExpressions'].has(profileId)).toBe(false)
        })

        it('should handle unscheduling non-existent profile', () => {
            expect(() => schedulerService.unscheduleProfile('nonexistent')).not.toThrow()
        })
    })

    describe('getProfileScheduleInfo', () => {
        const profileId = 'profile123'
        const nextRun = new Date('2023-01-01T12:00:00Z')
        const mockJob = { 
            nextInvocation: jest.fn().mockReturnValue(nextRun),
            schedule: { toString: jest.fn().mockReturnValue('0 0 * * *') }
        } as any

        it('should return schedule info for profile', () => {
            schedulerService['scheduledJobs'].set(profileId, mockJob)
            schedulerService['resolvedCronExpressions'].set(profileId, '0 0 * * *')
            
            const result = schedulerService.getProfileScheduleInfo(profileId)
            
            expect(result).toEqual({
                originalCron: null,
                resolvedCron: '0 0 * * *',
                nextRun
            })
        })

        it('should return null for non-existent profile', () => {
            const result = schedulerService.getProfileScheduleInfo('nonexistent')
            
            expect(result).toEqual({
                originalCron: null,
                resolvedCron: null,
                nextRun: null
            })
        })
    })

    describe('refreshSchedules', () => {
        const mockProfiles = [
            { 
                id: 'profile1', 
                name: 'Profile 1',
                ownerUserId: 'user123',
                withingsConfigDir: '/config/dir',
                garminAccountId: null,
                trainerroadAccountId: null,
                enabled: true, 
                enableBloodPressure: false,
                scheduleCron: '0 0 * * *',
                createdAt: new Date(),
                updatedAt: new Date(),
                ownerUser: {
                    id: 'user123',
                    createdAt: new Date(),
                    displayName: 'Test User'
                },
                runs: []
            },
            { 
                id: 'profile2', 
                name: 'Profile 2',
                ownerUserId: 'user123',
                withingsConfigDir: '/config/dir',
                garminAccountId: null,
                trainerroadAccountId: null,
                enabled: true, 
                enableBloodPressure: false,
                scheduleCron: '0 12 * * *',
                createdAt: new Date(),
                updatedAt: new Date(),
                ownerUser: {
                    id: 'user123',
                    createdAt: new Date(),
                    displayName: 'Test User'
                },
                runs: []
            }
        ]

        it('should refresh all schedules', async () => {
            mockProfileService.getScheduledProfiles.mockResolvedValue(mockProfiles)
            jest.spyOn(schedulerService, 'scheduleProfile' as any).mockImplementation(() => Promise.resolve())
            
            await schedulerService.refreshSchedules()
            
            expect(schedulerService['scheduleProfile']).toHaveBeenCalledTimes(2)
            expect(schedulerService['scheduleProfile']).toHaveBeenCalledWith('profile1', '0 0 * * *')
            expect(schedulerService['scheduleProfile']).toHaveBeenCalledWith('profile2', '0 12 * * *')
        })

        it('should handle scheduling errors gracefully', async () => {
            mockProfileService.getScheduledProfiles.mockResolvedValue(mockProfiles)
            jest.spyOn(schedulerService, 'scheduleProfile' as any)
                .mockImplementationOnce(() => Promise.resolve())
                .mockImplementationOnce(() => Promise.reject(new Error('Schedule failed')))
            
            await schedulerService.refreshSchedules()
            
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to schedule profile profile2: Error: Schedule failed'
            )
        })
    })

    describe('getStatus', () => {
        it('should return scheduler status', () => {
            const nextRun1 = new Date('2023-01-01T12:00:00Z')
            const nextRun2 = new Date('2023-01-01T14:00:00Z')
            const mockJob1 = { 
                nextInvocation: jest.fn().mockReturnValue(nextRun1),
                schedule: { toString: jest.fn().mockReturnValue('0 12 * * *') }
            } as any
            const mockJob2 = { 
                nextInvocation: jest.fn().mockReturnValue(nextRun2),
                schedule: { toString: jest.fn().mockReturnValue('0 14 * * *') }
            } as any
            
            schedulerService['scheduledJobs'].set('profile1', mockJob1)
            schedulerService['scheduledJobs'].set('profile2', mockJob2)
            schedulerService['isRunning'] = true
            
            const status = schedulerService.getStatus()
            
            expect(status).toEqual({
                running: true,
                scheduledJobs: 2,
                nextRuns: [
                    {
                        profileId: 'profile1',
                        profileName: 'Profile profile1',
                        nextRun: nextRun1,
                        cronExpression: '0 12 * * *'
                    },
                    {
                        profileId: 'profile2',
                        profileName: 'Profile profile2',
                        nextRun: nextRun2,
                        cronExpression: '0 14 * * *'
                    }
                ]
            })
        })
    })

    describe('shutdown', () => {
        it('should shutdown gracefully', async () => {
            const mockJob = { cancel: jest.fn() } as any
            schedulerService['scheduledJobs'].set('profile1', mockJob)
            schedulerService['reconciliationInterval'] = setInterval(() => {}, 60000) as any
            schedulerService['cleanupJob'] = mockJob as any
            schedulerService['isRunning'] = true
            
            await schedulerService.shutdown()
            
            expect(schedulerService['isRunning']).toBe(false)
            expect(clearIntervalSpy).toHaveBeenCalled()
            expect(mockJob.cancel).toHaveBeenCalledTimes(2)
            expect(schedulerService['scheduledJobs'].size).toBe(0)
        })
    })

    describe('executeScheduledRun', () => {
        const profileId = 'profile123'
        const mockProfile = { 
            id: profileId, 
            name: 'Test Profile',
            ownerUserId: 'user123',
            withingsConfigDir: '/config/dir',
            garminAccountId: null,
            trainerroadAccountId: null,
            enabled: true,
            enableBloodPressure: false,
            scheduleCron: '0 0 * * *',
            createdAt: new Date(),
            updatedAt: new Date(),
            ownerUser: {
                id: 'user123',
                createdAt: new Date(),
                displayName: 'Test User'
            },
            runs: []
        }
        const mockRun = { 
            id: 'run123',
            syncProfileId: profileId,
            mode: RunMode.CRON,
            status: RunStatus.PENDING,
            startedAt: new Date(),
            finishedAt: null,
            exitCode: null,
            logFilePath: null,
            errorMessage: null,
            syncProfile: mockProfile
        }

        beforeEach(() => {
            mockProfileService.getProfileById.mockResolvedValue(mockProfile)
            mockRunService.createRun.mockResolvedValue(mockRun)
        })

        it('should execute scheduled run successfully', async () => {
            mockRunService.isProfileRunning.mockResolvedValue(false)
            mockWithingsSyncRunner.runSync.mockResolvedValue({ 
                success: true,
                exitCode: 0
            })
            
            await schedulerService['executeScheduledRun'](profileId)
            
            expect(mockRunService.isProfileRunning).toHaveBeenCalledWith(profileId)
            expect(mockRunService.createRun).toHaveBeenCalledWith({
                syncProfileId: profileId,
                mode: RunMode.CRON
            })
            expect(mockWithingsSyncRunner.runSync).toHaveBeenCalledWith(
                profileId,
                'run123',
                { interactive: false, timeout: 10 * 60 * 1000 }
            )
        })

        it('should skip run if profile is already running', async () => {
            mockRunService.isProfileRunning.mockResolvedValue(true)
            
            await schedulerService['executeScheduledRun'](profileId)
            
            expect(mockRunService.createRun).not.toHaveBeenCalled()
            expect(logger.warn).toHaveBeenCalledWith(
                `Skipping scheduled run for profile ${profileId}: profile already running`
            )
        })

        it('should skip run if profile is disabled', async () => {
            mockRunService.isProfileRunning.mockResolvedValue(false)
            mockProfileService.getProfileById.mockResolvedValue({ 
                ...mockProfile, 
                enabled: false,
                ownerUser: {
                    id: 'user123',
                    createdAt: new Date(),
                    displayName: 'Test User'
                },
                runs: []
            })
            
            await schedulerService['executeScheduledRun'](profileId)
            
            expect(mockRunService.createRun).not.toHaveBeenCalled()
        })

        it('should handle run failure', async () => {
            mockRunService.isProfileRunning.mockResolvedValue(false)
            mockWithingsSyncRunner.runSync.mockResolvedValue({ 
                success: false, 
                errorMessage: 'Sync failed',
                exitCode: 1
            })
            
            await schedulerService['executeScheduledRun'](profileId)
            
            expect(logger.error).toHaveBeenCalledWith(
                `Scheduled run failed for profile ${profileId}: Sync failed`
            )
        })
    })

    describe('cleanupOrphanedRuns', () => {
        it('should clean up old running runs', async () => {
            const profileId = 'profile123'
            const mockProfile = {
                id: profileId,
                name: 'Test Profile',
                ownerUserId: 'user123',
                withingsConfigDir: '/config/dir',
                garminAccountId: null,
                trainerroadAccountId: null,
                enabled: true,
                enableBloodPressure: false,
                scheduleCron: '0 0 * * *',
                createdAt: new Date(),
                updatedAt: new Date(),
                ownerUser: {
                    id: 'user123',
                    createdAt: new Date(),
                    displayName: 'Test User'
                },
                runs: []
            }
            const oldRun = {
                id: 'run1',
                syncProfileId: 'profile123',
                mode: RunMode.CRON,
                status: RunStatus.RUNNING,
                startedAt: new Date(Date.now() - 35 * 60 * 1000),
                finishedAt: null,
                exitCode: null,
                logFilePath: null,
                errorMessage: null,
                syncProfile: mockProfile
            }
            const recentRun = {
                id: 'run2',
                syncProfileId: 'profile123',
                mode: RunMode.CRON,
                status: RunStatus.RUNNING,
                startedAt: new Date(Date.now() - 10 * 60 * 1000),
                finishedAt: null,
                exitCode: null,
                logFilePath: null,
                errorMessage: null,
                syncProfile: mockProfile
            }
            
            mockRunService.getRunsByStatus.mockResolvedValue([oldRun, recentRun])
            
            await schedulerService['cleanupOrphanedRuns']()
            
            expect(mockRunService.failRun).toHaveBeenCalledWith(
                'run1',
                'Run marked as failed due to application restart'
            )
            expect(mockRunService.failRun).not.toHaveBeenCalledWith('run2', expect.any(String))
        })
    })

    describe('isValidCronExpression', () => {
        it('should validate valid cron expressions', () => {
            expect(schedulerService['isValidCronExpression']('0 0 * * *')).toBe(true)
            expect(schedulerService['isValidCronExpression']('? ? * * *')).toBe(true)
        })

        it('should reject invalid cron expressions', () => {
            mockSchedule.scheduleJob.mockImplementation(() => {
                throw new Error('Invalid cron')
            })
            
            expect(schedulerService['isValidCronExpression']('invalid')).toBe(false)
        })
    })
})
