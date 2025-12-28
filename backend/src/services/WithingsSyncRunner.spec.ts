import {OutputCallback, RunOptions, WithingsSyncRunner} from '@/services/WithingsSyncRunner'
import {RunService} from '@/services/RunService'
import {ProfileService} from '@/services/ProfileService'
import {WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {CryptoService} from '@/services/CryptoService'
import {logger, RunLogger} from '@/utils/logger'
import {ChildProcess, spawn} from 'child_process'

// Mock all dependencies
jest.mock('../utils/logger')
jest.mock('../db/prisma', () => ({
    __esModule: true,
    default: {
        serviceAccount: {
            findUnique: jest.fn()
        }
    }
}))
jest.mock('child_process', () => ({
    spawn: jest.fn()
}))

const mockSpawn = jest.mocked(spawn)
const mockPrisma = require('../db/prisma').default

describe('WithingsSyncRunner', () => {
    let withingsSyncRunner: WithingsSyncRunner
    let mockRunService: jest.Mocked<RunService>
    let mockProfileService: jest.Mocked<ProfileService>
    let mockCryptoService: jest.Mocked<CryptoService>
    let mockWithingsAppConfigService: jest.Mocked<WithingsAppConfigService>
    let mockRunLogger: jest.Mocked<RunLogger>
    let mockChildProcess: jest.Mocked<ChildProcess>

    beforeEach(() => {
        jest.clearAllMocks()
        
        mockRunService = {
            createRunLogger: jest.fn(),
            updateRun: jest.fn(),
            startRun: jest.fn(),
            succeedRun: jest.fn(),
            failRun: jest.fn(),
            getRunLogLevel: jest.fn()
        } as any

        mockProfileService = {
            getProfileById: jest.fn()
        } as any

        mockCryptoService = {
            decrypt: jest.fn()
        } as any

        mockWithingsAppConfigService = {
            syncToProfile: jest.fn()
        } as any

        mockRunLogger = {
            getLogFilePath: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
            logCliOutput: jest.fn()
        } as any

        mockChildProcess = {
            kill: jest.fn(),
            on: jest.fn((event, callback) => {
                if (event === 'close') {
                    // Simulate immediate close with success
                    setTimeout(callback, 0, 0)
                }
            }),
            stdin: {
                write: jest.fn(),
                on: jest.fn()
            },
            stdout: {
                on: jest.fn()
            },
            stderr: {
                on: jest.fn()
            }
        } as any

        mockRunService.createRunLogger.mockReturnValue(mockRunLogger)
        mockSpawn.mockReturnValue(mockChildProcess)

        withingsSyncRunner = new WithingsSyncRunner(
            mockRunService,
            mockProfileService,
            mockCryptoService,
            mockWithingsAppConfigService
        )
    })

    describe('runSync', () => {
        const profileId = 'profile123'
        const runId = 'run456'
        const logFilePath = '/path/to/log.log'
        const mockProfile = {
            id: profileId,
            name: 'Test Profile',
            ownerUserId: 'user123',
            withingsConfigDir: '/config/dir',
            garminAccountId: 'garmin123',
            trainerroadAccountId: 'trainerroad123',
            enabled: true,
            enableBloodPressure: true,
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
        const mockGarminAccount = {
            id: 'garmin123',
            username: 'garminUser',
            passwordEncrypted: 'encryptedGarminPass'
        }
        const mockTrAccount = {
            id: 'trainerroad123',
            username: 'trUser',
            passwordEncrypted: 'encryptedTrPass'
        }

        beforeEach(() => {
            mockRunLogger.getLogFilePath.mockReturnValue(logFilePath)
            mockProfileService.getProfileById.mockResolvedValue(mockProfile)
            mockPrisma.serviceAccount.findUnique
                .mockResolvedValueOnce(mockGarminAccount)
                .mockResolvedValueOnce(mockTrAccount)
            mockCryptoService.decrypt
                .mockReturnValueOnce('garminPass')
                .mockReturnValueOnce('trPass')
        })

        it('should run sync successfully', async () => {
            // Mock successful process execution
            const executeCliSpy = jest.spyOn(withingsSyncRunner as any, 'executeCli')
                .mockResolvedValue({ success: true, exitCode: 0 })

            const options: RunOptions = { interactive: false, logLevel: 'info' }
            const result = await withingsSyncRunner.runSync(profileId, runId, options)

            expect(mockRunService.createRunLogger).toHaveBeenCalledWith(runId)
            expect(mockRunService.updateRun).toHaveBeenCalledWith(runId, { logFilePath })
            expect(mockWithingsAppConfigService.syncToProfile).toHaveBeenCalledWith(profileId)
            expect(mockRunService.startRun).toHaveBeenCalledWith(runId)
            expect(executeCliSpy).toHaveBeenCalled()
            expect(mockRunService.succeedRun).toHaveBeenCalledWith(runId, 0)
            expect(result.success).toBe(true)
        })

        it('should handle sync failure', async () => {
            const executeCliSpy = jest.spyOn(withingsSyncRunner as any, 'executeCli')
                .mockResolvedValue({ success: false, exitCode: 1, errorMessage: 'Sync failed' })

            const options: RunOptions = { interactive: false }
            const result = await withingsSyncRunner.runSync(profileId, runId, options)

            expect(executeCliSpy).toHaveBeenCalled()
            expect(mockRunService.failRun).toHaveBeenCalledWith(runId, 'Sync failed', 1)
            expect(result.success).toBe(false)
            expect(result.errorMessage).toBe('Sync failed')
        })

        it('should handle profile not found', async () => {
            mockProfileService.getProfileById.mockResolvedValue(null)

            const result = await withingsSyncRunner.runSync(profileId, runId)

            expect(result.success).toBe(false)
            expect(result.errorMessage).toContain('not found')
            expect(mockRunService.failRun).toHaveBeenCalled()
        })

        it('should use config directory override when provided', async () => {
            const options: RunOptions = { 
                interactive: false, 
                configDirOverride: '/override/dir' 
            }

            await withingsSyncRunner.runSync(profileId, runId, options)

            // Verify the environment variable is set with override
            expect(mockSpawn).toHaveBeenCalledWith(
                'withings-sync',
                expect.any(Array),
                expect.objectContaining({
                    env: expect.objectContaining({
                        WITHINGS_CONFIG_DIR: '/override/dir'
                    })
                })
            )
        })

        it('should handle execution errors', async () => {
            jest.spyOn(withingsSyncRunner as any, 'executeCli')
                .mockRejectedValue(new Error('Execution failed'))

            const result = await withingsSyncRunner.runSync(profileId, runId)

            expect(result.success).toBe(false)
            expect(result.errorMessage).toBe('Execution failed')
            expect(mockRunService.failRun).toHaveBeenCalledWith(runId, 'Execution failed')
        })
    })

    describe('startInteractiveRun', () => {
        const profileId = 'profile123'
        const runId = 'run456'
        const logFilePath = '/path/to/log.log'
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
        const outputCallback: OutputCallback = jest.fn()

        beforeEach(() => {
            mockRunLogger.getLogFilePath.mockReturnValue(logFilePath)
            mockProfileService.getProfileById.mockResolvedValue(mockProfile)
        })

        it('should start interactive run', async () => {
            jest.spyOn(withingsSyncRunner as any, 'spawnInteractiveProcess')
                .mockResolvedValue(mockChildProcess)

            await withingsSyncRunner.startInteractiveRun(profileId, runId, outputCallback)

            expect(mockRunService.createRunLogger).toHaveBeenCalledWith(runId)
            expect(mockRunService.updateRun).toHaveBeenCalledWith(runId, { logFilePath })
            expect(mockWithingsAppConfigService.syncToProfile).toHaveBeenCalledWith(profileId)
            expect(mockRunService.startRun).toHaveBeenCalledWith(runId)
            expect(withingsSyncRunner['runningProcesses'].has(runId)).toBe(true)
        })

        it('should handle process close event', async () => {
            jest.spyOn(withingsSyncRunner as any, 'spawnInteractiveProcess')
                .mockImplementation((_args, _env, _logger, _callback) => {
                    // Simulate process close
                    setTimeout(() => {
                        const closeCallback = mockChildProcess.on.mock.calls.find((call: any) => call[0] === 'close')?.[1] as any
                        if (closeCallback) closeCallback(0, null)
                    }, 0)
                    return Promise.resolve(mockChildProcess)
                })

            await withingsSyncRunner.startInteractiveRun(profileId, runId, outputCallback)

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10))

            expect(mockRunService.succeedRun).toHaveBeenCalledWith(runId, 0)
            expect(outputCallback).toHaveBeenCalledWith('status', 'completed with exit code 0')
        })

        it('should handle process error', async () => {
            jest.spyOn(withingsSyncRunner as any, 'spawnInteractiveProcess')
                .mockImplementation(() => {
                    // Simulate process error
                    setTimeout(() => {
                        const errorCallback = mockChildProcess.on.mock.calls.find((call: any) => call[0] === 'error')?.[1] as any
                        if (errorCallback) errorCallback(new Error('Process error'))
                    }, 0)
                    return Promise.resolve(mockChildProcess)
                })

            await withingsSyncRunner.startInteractiveRun(profileId, runId, outputCallback)

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10))

            expect(mockRunService.failRun).toHaveBeenCalledWith(runId, 'Process error: Process error')
            expect(outputCallback).toHaveBeenCalledWith('error', 'Process error: Process error')
        })
    })

    describe('sendInput', () => {
        const runId = 'run456'
        const input = 'test input'

        it('should send input to running process', async () => {
            withingsSyncRunner['runningProcesses'].set(runId, mockChildProcess)

            await withingsSyncRunner.sendInput(runId, 'session123', input)

            expect(mockChildProcess.stdin?.write).toHaveBeenCalledWith(input + '\n')
        })

        it('should handle no running process', async () => {
            await withingsSyncRunner.sendInput(runId, 'session123', input)

            expect(logger.warn).toHaveBeenCalledWith(`No running process found for run ${runId}`)
            expect(mockChildProcess.stdin?.write).not.toHaveBeenCalled()
        })
    })

    describe('detachRun', () => {
        const runId = 'run456'

        it('should detach from running process', async () => {
            withingsSyncRunner['runningProcesses'].set(runId, mockChildProcess)

            await withingsSyncRunner.detachRun(runId)

            expect(withingsSyncRunner['runningProcesses'].has(runId)).toBe(false)
            expect(logger.info).toHaveBeenCalledWith(`Detaching from run ${runId} (process continues running)`)
        })

        it('should handle detaching from non-existent process', async () => {
            await withingsSyncRunner.detachRun(runId)

            expect(withingsSyncRunner['runningProcesses'].has(runId)).toBe(false)
        })
    })

    describe('killRun', () => {
        const runId = 'run456'

        it('should kill running process', async () => {
            withingsSyncRunner['runningProcesses'].set(runId, mockChildProcess)

            await withingsSyncRunner.killRun(runId)

            expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM')
            expect(withingsSyncRunner['runningProcesses'].has(runId)).toBe(false)
        })

        it('should handle killing non-existent process', async () => {
            await withingsSyncRunner.killRun(runId)

            expect(mockChildProcess.kill).not.toHaveBeenCalled()
        })
    })

    describe('buildCliArgs', () => {
        const mockProfile = {
            withingsConfigDir: '/config/dir',
            garminAccountId: 'garmin123',
            trainerroadAccountId: 'trainerroad123',
            enableBloodPressure: true
        }
        const mockGarminAccount = {
            username: 'garminUser',
            passwordEncrypted: 'encryptedPass'
        }
        const mockTrAccount = {
            username: 'trUser',
            passwordEncrypted: 'encryptedTrPass'
        }

        beforeEach(() => {
            mockPrisma.serviceAccount.findUnique
                .mockResolvedValueOnce(mockGarminAccount)
                .mockResolvedValueOnce(mockTrAccount)
            mockCryptoService.decrypt
                .mockReturnValueOnce('garminPass')
                .mockReturnValueOnce('trPass')
        })

        it('should build CLI arguments with all options', async () => {
            const args = await withingsSyncRunner['buildCliArgs'](mockProfile, false, 'info')

            expect(args).toContain('--config-folder')
            expect(args).toContain('/config/dir')
            expect(args).toContain('--garmin-username')
            expect(args).toContain('garminUser')
            expect(args).toContain('--garmin-password')
            expect(args).toContain('garminPass')
            expect(args).toContain('--trainerroad-username')
            expect(args).toContain('trUser')
            expect(args).toContain('--trainerroad-password')
            expect(args).toContain('trPass')
            expect(args).toContain('--features')
            expect(args).toContain('BLOOD_PRESSURE')
        })

        it('should add verbose flag for debug log level', async () => {
            const args = await withingsSyncRunner['buildCliArgs'](mockProfile, false, 'debug')

            expect(args).toContain('--verbose')
        })

        it('should add silent flag for warn/error log level', async () => {
            const args = await withingsSyncRunner['buildCliArgs'](mockProfile, false, 'warn')

            expect(args).toContain('--silent')
        })

        it('should handle missing service accounts', async () => {
            const profileNoAccounts = { ...mockProfile, garminAccountId: null, trainerroadAccountId: null }
            
            const args = await withingsSyncRunner['buildCliArgs'](profileNoAccounts, false, 'info')

            expect(args).not.toContain('--garmin-username')
            expect(args).not.toContain('--trainerroad-username')
        })
    })

    describe('detectInteractivePrompt', () => {
        it('should detect MFA prompts', () => {
            const output = 'Please enter the MFA code:'
            
            const result = withingsSyncRunner['detectInteractivePrompt'](output)
            
            expect(result).toBe(true)
        })

        it('should detect authentication prompts', () => {
            const output = 'User interaction needed to get Authentification Code from Withings!'
            
            const result = withingsSyncRunner['detectInteractivePrompt'](output)
            
            expect(result).toBe(true)
        })

        it('should not detect prompts in regular output', () => {
            const output = 'Sync completed successfully'
            
            const result = withingsSyncRunner['detectInteractivePrompt'](output)
            
            expect(result).toBe(false)
        })
    })

    describe('extractWithingsAuthUrls', () => {
        it('should extract Withings auth URLs', () => {
            const output = 'Please visit https://account.withings.com/oauth2_user/authorize123 to authenticate'
            
            const urls = withingsSyncRunner['extractWithingsAuthUrls'](output)
            
            expect(urls).toContain('https://account.withings.com/oauth2_user/authorize123')
        })

        it('should remove duplicate URLs', () => {
            const output = 'Visit https://account.withings.com/oauth2_user/authorize123 and https://account.withings.com/oauth2_user/authorize123'
            
            const urls = withingsSyncRunner['extractWithingsAuthUrls'](output)
            
            expect(urls).toHaveLength(1)
        })

        it('should return empty array when no URLs found', () => {
            const output = 'No URLs in this output'
            
            const urls = withingsSyncRunner['extractWithingsAuthUrls'](output)
            
            expect(urls).toEqual([])
        })
    })

    describe('checkCliAvailability', () => {
        it('should return true when CLI is available', async () => {
            mockSpawn.mockReturnValue({
                on: jest.fn().mockImplementation((event, callback) => {
                    if (event === 'close') callback(0)
                })
            } as any)

            const result = await withingsSyncRunner.checkCliAvailability()

            expect(result).toBe(true)
            expect(mockSpawn).toHaveBeenCalledWith('withings-sync', ['--version'], { stdio: 'ignore' })
        })

        it('should return false when CLI is not available', async () => {
            mockSpawn.mockReturnValue({
                on: jest.fn().mockImplementation((event, callback) => {
                    if (event === 'error') callback(new Error('Command not found'))
                })
            } as any)

            const result = await withingsSyncRunner.checkCliAvailability()

            expect(result).toBe(false)
        })
    })

    describe('getCliVersion', () => {
        it('should return CLI version', async () => {
            const mockProcess = {
                stdout: {
                    on: jest.fn().mockImplementation((event, callback) => {
                        if (event === 'data') callback(Buffer.from('withings-sync v1.2.3'))
                    })
                },
                on: jest.fn().mockImplementation((event, callback) => {
                    if (event === 'close') callback(0)
                })
            }
            mockSpawn.mockReturnValue(mockProcess as any)

            const version = await withingsSyncRunner.getCliVersion()

            expect(version).toBe('withings-sync v1.2.3')
        })

        it('should return null on error', async () => {
            mockSpawn.mockReturnValue({
                on: jest.fn().mockImplementation((event, callback) => {
                    if (event === 'error') callback(new Error('Command not found'))
                })
            } as any)

            const version = await withingsSyncRunner.getCliVersion()

            expect(version).toBeNull()
        })
    })
})
