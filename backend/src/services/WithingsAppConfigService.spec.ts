import {WithingsAppConfig, WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {CryptoService} from '@/services/CryptoService'
import {ConfigDirectoryService} from '@/services/ConfigDirectoryService'
import {LoggerService} from '@/services/LoggerService'
import {writeFileSync} from 'fs'
import {join} from 'path'
import {PrismaClient, Settings} from '@/db/prisma-client-generated/client'

// Mock all dependencies
jest.mock('../services/LoggerService')
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    unlinkSync: jest.fn(),
    writeFileSync: jest.fn(),
    appendFileSync: jest.fn(),
    mkdirSync: jest.fn()
}))

describe('WithingsAppConfigService', () => {
    let withingsAppConfigService: WithingsAppConfigService
    let mockPrisma: jest.Mocked<PrismaClient>
    let mockConfigDirectoryService: jest.Mocked<ConfigDirectoryService>
    let mockCryptoService: jest.Mocked<CryptoService>
    let mockLogger: jest.Mocked<LoggerService>

    beforeEach(() => {
        jest.clearAllMocks()
        
        mockPrisma = {
            settings: {
                update: jest.fn(),
                findUnique: jest.fn()
            }
        } as any

        mockConfigDirectoryService = {
            provideConfigDirectory: jest.fn(),
            provideProfileDirectory: jest.fn(),
            getConfigDirectoryFolders: jest.fn()
        } as any

        mockCryptoService = {
            encrypt: jest.fn(),
            decrypt: jest.fn()
        } as any
        
        // Create mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            writeLog: jest.fn(),
            setFastifyLogger: jest.fn(),
            createRunLogger: jest.fn(),
            readRunLogs: jest.fn()
        } as any

        withingsAppConfigService = new WithingsAppConfigService(
            mockPrisma,
            mockConfigDirectoryService,
            mockCryptoService,
            mockLogger
        )
    })

    describe('updateWithingsAppConfig', () => {
        const clientId = 'test-client-id'
        const consumerSecret = 'test-consumer-secret'
        const callbackUrl = 'http://test-callback.com'
        const encryptedSecret = 'encrypted-secret'

        beforeEach(() => {
            mockCryptoService.encrypt.mockReturnValue(encryptedSecret)
            jest.spyOn(withingsAppConfigService, 'writeWithingsAppFiles' as any).mockImplementation(() => Promise.resolve())
        })

        it('should update Withings app configuration', async () => {
            await withingsAppConfigService.updateWithingsAppConfig(clientId, consumerSecret, callbackUrl)
            
            expect(mockCryptoService.encrypt).toHaveBeenCalledWith(consumerSecret)
            expect(mockPrisma.settings.update).toHaveBeenCalledWith({
                where: { id: 'global' },
                data: {
                    withingsClientId: clientId,
                    withingsConsumerSecret: encryptedSecret,
                    withingsCallbackUrl: callbackUrl
                }
            })
            expect(withingsAppConfigService['writeWithingsAppFiles']).toHaveBeenCalledWith(
                clientId,
                consumerSecret,
                callbackUrl
            )
        })

        it('should handle null callback URL', async () => {
            await withingsAppConfigService.updateWithingsAppConfig(clientId, consumerSecret)
            
            expect(mockPrisma.settings.update).toHaveBeenCalledWith({
                where: { id: 'global' },
                data: {
                    withingsClientId: clientId,
                    withingsConsumerSecret: encryptedSecret,
                    withingsCallbackUrl: null
                }
            })
        })
    })

    describe('deleteWithingsAppConfig', () => {
        beforeEach(() => {
            jest.spyOn(withingsAppConfigService, 'deleteWithingsAppFiles' as any).mockImplementation(() => Promise.resolve())
        })

        it('should delete Withings app configuration', async () => {
            await withingsAppConfigService.deleteWithingsAppConfig()
            
            expect(mockPrisma.settings.update).toHaveBeenCalledWith({
                where: { id: 'global' },
                data: {
                    withingsClientId: null,
                    withingsConsumerSecret: null,
                    withingsCallbackUrl: null
                }
            })
            expect(withingsAppConfigService['deleteWithingsAppFiles']).toHaveBeenCalled()
        })
    })

    describe('writeWithingsAppFiles', () => {
        const clientId = 'test-client-id'
        const consumerSecret = 'test-consumer-secret'
        const callbackUrl = 'http://test-callback.com'
        const profileDirs = ['/path/to/profile1', '/path/to/profile2']

        beforeEach(() => {
            mockConfigDirectoryService.provideConfigDirectory.mockReturnValue()
            mockConfigDirectoryService.getConfigDirectoryFolders.mockReturnValue(profileDirs as any)
        })

        it('should write config files to all profile directories', async () => {
            await withingsAppConfigService.writeWithingsAppFiles(clientId, consumerSecret, callbackUrl)
            
            expect(mockConfigDirectoryService.provideConfigDirectory).toHaveBeenCalled()
            expect(mockConfigDirectoryService.getConfigDirectoryFolders).toHaveBeenCalled()
            
            const expectedConfig: WithingsAppConfig = {
                client_id: clientId,
                consumer_secret: consumerSecret,
                callback_url: callbackUrl
            }
            
            expect(writeFileSync).toHaveBeenCalledTimes(2)
            expect(writeFileSync).toHaveBeenCalledWith(
                join('/path/to/profile1', 'withings_app.json'),
                JSON.stringify(expectedConfig, null, 2),
                { mode: 0o600 }
            )
            expect(writeFileSync).toHaveBeenCalledWith(
                join('/path/to/profile2', 'withings_app.json'),
                JSON.stringify(expectedConfig, null, 2),
                { mode: 0o600 }
            )
        })

        it('should write config without callback URL when not provided', async () => {
            await withingsAppConfigService.writeWithingsAppFiles(clientId, consumerSecret)
            
            const expectedConfig: WithingsAppConfig = {
                client_id: clientId,
                consumer_secret: consumerSecret
            }
            
            expect(writeFileSync).toHaveBeenCalledWith(
                expect.any(String),
                JSON.stringify(expectedConfig, null, 2),
                { mode: 0o600 }
            )
        })
    })

    describe('deleteWithingsAppFiles', () => {
        const profileDirs = ['/path/to/profile1', '/path/to/profile2']

        beforeEach(() => {
            mockConfigDirectoryService.getConfigDirectoryFolders.mockReturnValue(profileDirs as any)
        })

        it('should delete config files from all profile directories', async () => {
            const mockFs = jest.mocked(require('fs'))
            mockFs.existsSync.mockReturnValue(true)
            
            await withingsAppConfigService.deleteWithingsAppFiles()
            
            expect(mockFs.existsSync).toHaveBeenCalledTimes(2)
            expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2)
            expect(mockFs.unlinkSync).toHaveBeenCalledWith(join('/path/to/profile1', 'withings_app.json'))
            expect(mockFs.unlinkSync).toHaveBeenCalledWith(join('/path/to/profile2', 'withings_app.json'))
        })

        it('should not delete non-existent config files', async () => {
            const mockFs = jest.mocked(require('fs'))
            mockFs.existsSync.mockReturnValue(false)
            
            await withingsAppConfigService.deleteWithingsAppFiles()
            
            expect(mockFs.unlinkSync).not.toHaveBeenCalled()
        })
    })

    describe('syncToProfile', () => {
        const profileId = 'profile123'
        const profileDir = '/path/to/profile123'
        const mockSettings: Settings = {
            id: 'global',
            logLevel: 'info',
            withingsClientId: 'test-client',
            withingsConsumerSecret: 'encrypted-secret',
            withingsCallbackUrl: null,
            withingsCustomApp: true,
            apiTimeout: 30,
            timeFormat: '24h',
            dateFormat: 'DD/MM/YYYY',
            updatedAt: new Date()
        }

        beforeEach(() => {
            (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(mockSettings)
            mockConfigDirectoryService.provideProfileDirectory.mockReturnValue(profileDir)
            mockCryptoService.decrypt.mockReturnValue('decrypted-secret')
        })

        it('should sync config to specific profile', async () => {
            await withingsAppConfigService.syncToProfile(profileId)
            
            expect(mockPrisma.settings.findUnique).toHaveBeenCalledWith({
                where: { id: 'global' }
            })
            expect(mockConfigDirectoryService.provideProfileDirectory).toHaveBeenCalledWith(profileId)
            expect(mockCryptoService.decrypt).toHaveBeenCalledWith('encrypted-secret')
            
            const expectedConfig: WithingsAppConfig = {
                client_id: 'test-client',
                consumer_secret: 'decrypted-secret'
            }
            
            expect(writeFileSync).toHaveBeenCalledWith(
                join(profileDir, 'withings_app.json'),
                JSON.stringify(expectedConfig, null, 2),
                { mode: 0o600 }
            )
        })

        it('should handle settings with callback URL', async () => {
            const settingsWithCallback = {
                ...mockSettings,
                withingsCallbackUrl: 'http://callback.com'
            }
            ;(mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(settingsWithCallback)
            
            await withingsAppConfigService.syncToProfile(profileId)
            
            const expectedConfig: WithingsAppConfig = {
                client_id: 'test-client',
                consumer_secret: 'decrypted-secret',
                callback_url: 'http://callback.com'
            }
            
            expect(writeFileSync).toHaveBeenCalledWith(
                expect.any(String),
                JSON.stringify(expectedConfig, null, 2),
                { mode: 0o600 }
            )
        })

        it('should return early if no settings exist', async () => {
            (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(null)
            
            await withingsAppConfigService.syncToProfile(profileId)
            
            expect(writeFileSync).not.toHaveBeenCalled()
        })

        it('should return early if no Withings config exists', async () => {
            const settingsWithoutConfig = {
                ...mockSettings,
                withingsClientId: null,
                withingsConsumerSecret: null
            }
            ;(mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(settingsWithoutConfig)
            
            await withingsAppConfigService.syncToProfile(profileId)
            
            expect(writeFileSync).not.toHaveBeenCalled()
        })

        it('should handle decryption errors', async () => {
            mockCryptoService.decrypt.mockImplementation(() => {
                throw new Error('Decryption failed')
            })
            
            await expect(withingsAppConfigService.syncToProfile(profileId)).rejects.toThrow(
                'Failed to decrypt Withings consumer secret: Error: Decryption failed'
            )
        })

        it('should handle empty consumer secret', async () => {
            const settingsWithEmptySecret = {
                ...mockSettings,
                withingsConsumerSecret: ''
            }
            ;(mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(settingsWithEmptySecret)
            
            // Should return early without writing config
            await withingsAppConfigService.syncToProfile(profileId)
            
            // Verify no config was written
            expect(mockConfigDirectoryService.provideProfileDirectory).not.toHaveBeenCalled()
        })
    })

    describe('hasWithingsAppConfig', () => {
        it('should return true when config exists', () => {
            const settings: Settings = {
                id: 'global',
                logLevel: 'info',
                withingsClientId: 'client123',
                withingsConsumerSecret: 'secret123',
                withingsCallbackUrl: null,
                withingsCustomApp: true,
                apiTimeout: 30,
                timeFormat: '24h',
                dateFormat: 'DD/MM/YYYY',
                updatedAt: new Date()
            }
            
            const result = withingsAppConfigService.hasWithingsAppConfig(settings)
            
            expect(result).toBe(true)
        })

        it('should return false when client ID is missing', () => {
            const settings: Settings = {
                id: 'global',
                logLevel: 'info',
                withingsClientId: null,
                withingsConsumerSecret: 'secret123',
                withingsCallbackUrl: null,
                withingsCustomApp: true,
                apiTimeout: 30,
                timeFormat: '24h',
                dateFormat: 'DD/MM/YYYY',
                updatedAt: new Date()
            }
            
            const result = withingsAppConfigService.hasWithingsAppConfig(settings)
            
            expect(result).toBe(false)
        })

        it('should return false when consumer secret is missing', () => {
            const settings: Settings = {
                id: 'global',
                logLevel: 'info',
                withingsClientId: 'client123',
                withingsConsumerSecret: null,
                withingsCallbackUrl: null,
                withingsCustomApp: true,
                apiTimeout: 30,
                timeFormat: '24h',
                dateFormat: 'DD/MM/YYYY',
                updatedAt: new Date()
            }
            
            const result = withingsAppConfigService.hasWithingsAppConfig(settings)
            
            expect(result).toBe(false)
        })

        it('should return false when settings is null', () => {
            const result = withingsAppConfigService.hasWithingsAppConfig(null as any)
            
            expect(result).toBe(false)
        })
    })
})
