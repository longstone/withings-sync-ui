import { SettingsService, Settings, UpdateSettingsData } from './SettingsService'
import { CryptoService } from './CryptoService'
import { WithingsAppConfigService } from './WithingsAppConfigService'
import { logger } from '../utils/logger'
import { PrismaClient } from '../db/prisma-client-generated/client'

// Mock all dependencies
jest.mock('../utils/logger')
jest.mock('../db/prisma-client-generated/client', () => ({
    PrismaClient: jest.fn().mockImplementation(() => ({
        settings: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            upsert: jest.fn()
        }
    }))
}))

describe('SettingsService', () => {
    let settingsService: SettingsService
    let mockPrisma: jest.Mocked<PrismaClient>
    let mockWithingsAppConfigService: jest.Mocked<WithingsAppConfigService>
    let mockCryptoService: jest.Mocked<CryptoService>

    beforeEach(() => {
        jest.clearAllMocks()
        
        // Create mocked dependencies
        mockPrisma = new PrismaClient({} as any) as any
        mockWithingsAppConfigService = {
            updateWithingsAppConfig: jest.fn(),
            deleteWithingsAppConfig: jest.fn()
        } as any

        mockCryptoService = {
            encrypt: jest.fn(),
            decrypt: jest.fn()
        } as any
        
        // Create service with mocked dependencies
        settingsService = new SettingsService(
            mockPrisma,
            mockWithingsAppConfigService,
            mockCryptoService
        )
    })

    describe('getSettings', () => {
        const mockSettings = {
            id: 'global',
            logLevel: 'info',
            withingsCallbackUrl: 'http://localhost:3000/callback',
            withingsClientId: 'client123',
            withingsConsumerSecret: 'encrypted-secret',
            withingsCustomApp: true,
            apiTimeout: 30,
            timeFormat: '24h',
            dateFormat: 'DD/MM/YYYY',
            updatedAt: new Date()
        }

        it('should return existing settings', async () => {
            (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(mockSettings)
            
            const result = await settingsService.getSettings()
            
            expect(mockPrisma.settings.findUnique).toHaveBeenCalledWith({
                where: { id: 'global' }
            })
            expect(result).toEqual({
                logLevel: 'info',
                withingsCallbackUrl: 'http://localhost:3000/callback',
                withingsClientId: 'client123',
                withingsConsumerSecret: 'encrypted-secret',
                withingsCustomApp: true,
                apiTimeout: 30,
                timeFormat: '24h',
                dateFormat: 'DD/MM/YYYY',
                updatedAt: mockSettings.updatedAt
            })
        })

        it('should create default settings if none exist', async () => {
            (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(null)
            ;(mockPrisma.settings.create as jest.Mock).mockResolvedValue(mockSettings)
            
            const result = await settingsService.getSettings()
            
            expect(mockPrisma.settings.create).toHaveBeenCalledWith({
                data: {
                    id: 'global',
                    logLevel: 'info',
                    apiTimeout: 30,
                    timeFormat: '24h',
                    dateFormat: 'DD/MM/YYYY',
                    withingsCustomApp: false
                }
            })
            expect(result).toBeDefined()
        })

        it('should handle undefined optional fields', async () => {
            const settingsWithNulls = {
                ...mockSettings,
                withingsCallbackUrl: null,
                withingsClientId: null,
                withingsConsumerSecret: null
            }
            ;(mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(settingsWithNulls)
            
            const result = await settingsService.getSettings()
            
            expect(result.withingsCallbackUrl).toBeUndefined()
            expect(result.withingsClientId).toBeUndefined()
            expect(result.withingsConsumerSecret).toBeUndefined()
        })
    })

    describe('updateSettings', () => {
        const existingSettings: Settings = {
            logLevel: 'info',
            withingsCallbackUrl: 'http://localhost:3000/callback',
            withingsClientId: 'client123',
            withingsConsumerSecret: 'encrypted-secret',
            withingsCustomApp: true,
            apiTimeout: 30,
            timeFormat: '24h',
            dateFormat: 'DD/MM/YYYY',
            updatedAt: new Date()
        }

        const updatedSettings = {
            ...existingSettings,
            logLevel: 'debug',
            apiTimeout: 60
        }

        beforeEach(() => {
            ;jest.spyOn(settingsService, 'getSettings').mockResolvedValue(existingSettings)
            ;(mockPrisma.settings.upsert as jest.Mock).mockResolvedValue(updatedSettings)
        })

        it('should update settings successfully', async () => {
            const updateData: UpdateSettingsData = {
                logLevel: 'debug',
                apiTimeout: 60
            }
            
            const result = await settingsService.updateSettings(updateData)
            
            expect(mockPrisma.settings.upsert).toHaveBeenCalledWith({
                where: { id: 'global' },
                update: updateData,
                create: {
                    id: 'global',
                    ...updateData
                }
            })
            expect(result.logLevel).toBe('debug')
            expect(result.apiTimeout).toBe(60)
        })

        it('should handle Withings app configuration changes', async () => {
            const updateData: UpdateSettingsData = {
                withingsClientId: 'new-client',
                withingsConsumerSecret: 'new-secret',
                withingsCustomApp: true,
                withingsCallbackUrl: 'http://new-callback.com'
            }
            
            mockCryptoService.encrypt.mockReturnValue('encrypted-new-secret')
            ;(mockPrisma.settings.upsert as jest.Mock).mockResolvedValue({
                ...updatedSettings,
                withingsClientId: 'new-client',
                withingsConsumerSecret: 'encrypted-new-secret'
            })
            
            await settingsService.updateSettings(updateData)
            
            expect(mockWithingsAppConfigService.updateWithingsAppConfig).toHaveBeenCalledWith(
                'new-client',
                'new-secret',
                'http://new-callback.com'
            )
            expect(mockCryptoService.encrypt).toHaveBeenCalledWith('new-secret')
        })

        it('should delete Withings config when disabled', async () => {
            const updateData: UpdateSettingsData = {
                withingsCustomApp: false
            }
            
            await settingsService.updateSettings(updateData)
            
            expect(mockWithingsAppConfigService.deleteWithingsAppConfig).toHaveBeenCalled()
        })

        it('should delete Withings config when credentials are incomplete', async () => {
            // Mock getSettings to return settings without credentials
            jest.spyOn(settingsService, 'getSettings').mockResolvedValue({
                ...existingSettings,
                withingsClientId: undefined,
                withingsConsumerSecret: undefined,
                withingsCustomApp: true
            })
            
            const updateData: UpdateSettingsData = {
                withingsClientId: 'client-only',
                withingsCustomApp: true
            }
            
            await expect(settingsService.updateSettings(updateData)).rejects.toThrow(
                'Both client ID and consumer secret must be provided or removed together'
            )
        })

        it('should validate credential completeness', async () => {
            // Mock getSettings to return settings without credentials
            jest.spyOn(settingsService, 'getSettings').mockResolvedValue({
                ...existingSettings,
                withingsClientId: undefined,
                withingsConsumerSecret: undefined,
                withingsCustomApp: true
            })
            
            const updateData: UpdateSettingsData = {
                withingsClientId: undefined,
                withingsConsumerSecret: 'secret-only'
            }
            
            await expect(settingsService.updateSettings(updateData)).rejects.toThrow(
                'Both client ID and consumer secret must be provided or removed together'
            )
        })

        it('should not update Withings config when no changes', async () => {
            const updateData: UpdateSettingsData = {
                logLevel: 'debug'
            }
            
            await settingsService.updateSettings(updateData)
            
            expect(mockWithingsAppConfigService.updateWithingsAppConfig).not.toHaveBeenCalled()
            expect(mockWithingsAppConfigService.deleteWithingsAppConfig).not.toHaveBeenCalled()
        })
    })

    describe('getDecryptedWithingsConfig', () => {
        it('should return decrypted config when credentials exist', async () => {
            const mockSettings = {
                withingsClientId: 'client123',
                withingsConsumerSecret: 'encrypted-secret'
            }
            mockCryptoService.decrypt.mockReturnValue('decrypted-secret')
            ;(mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(mockSettings)
            
            const result = await settingsService.getDecryptedWithingsConfig()
            
            expect(result).toEqual({
                clientId: 'client123',
                consumerSecret: 'decrypted-secret'
            })
            expect(mockCryptoService.decrypt).toHaveBeenCalledWith('encrypted-secret')
        })

        it('should return null when credentials are missing', async () => {
            const mockSettings = {
                withingsClientId: null,
                withingsConsumerSecret: null
            }
            ;(mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(mockSettings)
            
            const result = await settingsService.getDecryptedWithingsConfig()
            
            expect(result).toBeNull()
        })

        it('should return null when settings do not exist', async () => {
            (mockPrisma.settings.findUnique as jest.Mock).mockResolvedValue(null)
            
            const result = await settingsService.getDecryptedWithingsConfig()
            
            expect(result).toBeNull()
        })
    })

    describe('saveWithingsAppConfig', () => {
        it('should save Withings app config', async () => {
            const config = {
                callback_url: 'http://callback.com',
                client_id: 'client123',
                consumer_secret: 'secret123'
            }
            
            await settingsService.saveWithingsAppConfig(config)
            
            expect(mockWithingsAppConfigService.updateWithingsAppConfig).toHaveBeenCalledWith(
                config.client_id,
                config.consumer_secret,
                config.callback_url
            )
        })
    })

    describe('removeWithingsConfig', () => {
        it('should remove Withings config', async () => {
            await settingsService.removeWithingsConfig()
            
            expect(mockWithingsAppConfigService.deleteWithingsAppConfig).toHaveBeenCalled()
        })
    })

    describe('updateLogLevel', () => {
        it('should update log level', async () => {
            const logLevel = 'debug'
            ;(mockPrisma.settings.update as jest.Mock).mockResolvedValue({})
            
            await settingsService.updateLogLevel(logLevel)
            
            expect(mockPrisma.settings.update).toHaveBeenCalledWith({
                where: { id: 'global' },
                data: { logLevel }
            })
            expect(logger.info).toHaveBeenCalledWith(`Log level updated to ${logLevel}`, undefined, undefined)
        })
    })
})
