import {CreateProfileData, ProfileService, UpdateProfileData} from '@/services/ProfileService'
import {CryptoService} from '@/services/CryptoService'
import {WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {ConfigDirectoryService} from '@/services/ConfigDirectoryService'
import {LoggerService} from '@/services/LoggerService'

// Mock all dependencies
jest.mock('../db/prisma', () => ({
    __esModule: true,
    default: {
        syncProfile: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn()
        },
        user: {
            upsert: jest.fn()
        },
        serviceAccount: {
            create: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        },
        syncRun: {
            findMany: jest.fn(),
            deleteMany: jest.fn()
        },
        $transaction: jest.fn()
    }
}))

jest.mock('../services/LoggerService')
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    unlinkSync: jest.fn(),
    rmSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    writeFileSync: jest.fn(),
    appendFileSync: jest.fn()
}))
jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/'))
}))

jest.mock('crypto', () => ({
    randomUUID: jest.fn()
}))

const mockPrisma = jest.requireMock('../db/prisma').default
const mockFs = jest.mocked(jest.requireMock('fs'))
const mockCrypto = jest.requireMock('crypto')

describe('ProfileService', () => {
    let profileService: ProfileService
    let mockCryptoService: jest.Mocked<CryptoService>
    let mockWithingsAppConfigService: jest.Mocked<WithingsAppConfigService>
    let mockConfigDirectoryService: jest.Mocked<ConfigDirectoryService>
    let mockLogger: jest.Mocked<LoggerService>

    beforeEach(() => {
        jest.clearAllMocks()
        
        mockCryptoService = {
            encrypt: jest.fn(),
            decrypt: jest.fn()
        } as any

        mockWithingsAppConfigService = {
            syncToProfile: jest.fn()
        } as any

        mockConfigDirectoryService = {
            provideConfigDirectory: jest.fn(),
            provideProfileDirectory: jest.fn()
        } as any

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        } as any

        profileService = new ProfileService(
            mockCryptoService,
            mockWithingsAppConfigService,
            mockConfigDirectoryService,
            mockLogger
        )
    })

    describe('getProfilesByUserId', () => {
        it('should fetch profiles for a specific user', async () => {
            const userId = 'user123'
            const mockProfiles = [
                { id: 'profile1', name: 'Profile 1', ownerUserId: userId },
                { id: 'profile2', name: 'Profile 2', ownerUserId: userId }
            ]
            
            mockPrisma.syncProfile.findMany.mockResolvedValue(mockProfiles)
            
            const result = await profileService.getProfilesByUserId(userId)
            
            expect(mockPrisma.syncProfile.findMany).toHaveBeenCalledWith({
                where: { ownerUserId: userId },
                include: {
                    ownerUser: true,
                    runs: {
                        orderBy: { startedAt: 'desc' },
                        take: 5
                    }
                }
            })
            expect(result).toEqual(mockProfiles)
        })

        it('should handle errors when fetching profiles', async () => {
            const userId = 'user123'
            const error = new Error('Database error')
            
            mockPrisma.syncProfile.findMany.mockRejectedValue(error)
            
            await expect(profileService.getProfilesByUserId(userId)).rejects.toThrow(error)
            expect(mockLogger.error).toHaveBeenCalledWith(`Failed to fetch profiles for user ${userId}`)
        })
    })

    describe('getAllProfiles', () => {
        it('should fetch all profiles', async () => {
            const mockProfiles = [
                { id: 'profile1', name: 'Profile 1' },
                { id: 'profile2', name: 'Profile 2' }
            ]
            
            mockPrisma.syncProfile.findMany.mockResolvedValue(mockProfiles)
            
            const result = await profileService.getAllProfiles()
            
            expect(mockPrisma.syncProfile.findMany).toHaveBeenCalledWith({
                include: {
                    ownerUser: true,
                    runs: {
                        orderBy: { startedAt: 'desc' },
                        take: 5
                    }
                }
            })
            expect(result).toEqual(mockProfiles)
        })

        it('should handle errors when fetching all profiles', async () => {
            const error = new Error('Database error')
            
            mockPrisma.syncProfile.findMany.mockRejectedValue(error)
            
            await expect(profileService.getAllProfiles()).rejects.toThrow(error)
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch all profiles')
        })
    })

    describe('getProfileById', () => {
        it('should fetch a profile by ID', async () => {
            const profileId = 'profile123'
            const mockProfile = { id: profileId, name: 'Test Profile' }
            
            mockPrisma.syncProfile.findUnique.mockResolvedValue(mockProfile)
            
            const result = await profileService.getProfileById(profileId)
            
            expect(mockPrisma.syncProfile.findUnique).toHaveBeenCalledWith({
                where: { id: profileId },
                include: {
                    ownerUser: true,
                    runs: {
                        orderBy: { startedAt: 'desc' }
                    }
                }
            })
            expect(result).toEqual(mockProfile)
        })

        it('should handle errors when fetching profile by ID', async () => {
            const profileId = 'profile123'
            const error = new Error('Database error')
            
            mockPrisma.syncProfile.findUnique.mockRejectedValue(error)
            
            await expect(profileService.getProfileById(profileId)).rejects.toThrow(error)
            expect(mockLogger.error).toHaveBeenCalledWith(`Failed to fetch profile ${profileId}`)
        })
    })

    describe('createProfile', () => {
        const profileId = 'generated-uuid'
        const createData: CreateProfileData = {
            name: 'Test Profile',
            ownerUserId: 'user123',
            garminUsername: 'garminUser',
            garminPassword: 'garminPass',
            trainerroadUsername: 'trUser',
            trainerroadPassword: 'trPass',
            enabled: true
        }

        beforeEach(() => {
            mockCrypto.randomUUID.mockReturnValue(profileId)
            mockCryptoService.encrypt.mockReturnValue('encrypted-password')
        })

        it('should create a profile with service accounts', async () => {
            const mockUser = { id: 'user123', displayName: 'Default User' }
            const mockProfile = { id: profileId, name: 'Test Profile', ownerUserId: 'user123' }
            const mockGarminAccount = { id: 'garmin-id', type: 'garmin' }
            const mockTrAccount = { id: 'tr-id', type: 'trainerroad' }

            mockPrisma.user.upsert.mockResolvedValue(mockUser)
            mockConfigDirectoryService.provideProfileDirectory.mockReturnValue('/custom/data/withings-config/generated-uuid')
            mockPrisma.syncProfile.create.mockResolvedValue(mockProfile)
            mockPrisma.serviceAccount.create
                .mockResolvedValueOnce(mockGarminAccount)
                .mockResolvedValueOnce(mockTrAccount)
            mockPrisma.syncProfile.update.mockResolvedValue(mockProfile)

            const result = await profileService.createProfile(createData)

            expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
                where: { id: 'user123' },
                update: {},
                create: {
                    id: 'user123',
                    displayName: 'user123'
                }
            })

            expect(mockPrisma.syncProfile.create).toHaveBeenCalledWith({
                data: {
                    name: 'Test Profile',
                    ownerUserId: 'user123',
                    id: profileId,
                    withingsConfigDir: '/custom/data/withings-config/generated-uuid',
                    enabled: true
                },
                include: {
                    ownerUser: true
                }
            })

            expect(mockConfigDirectoryService.provideConfigDirectory).toHaveBeenCalled()
            expect(mockConfigDirectoryService.provideProfileDirectory).toHaveBeenCalledWith(profileId)
            expect(mockPrisma.serviceAccount.create).toHaveBeenCalledTimes(2)
            expect(mockCryptoService.encrypt).toHaveBeenCalledWith('garminPass')
            expect(mockCryptoService.encrypt).toHaveBeenCalledWith('trPass')

            expect(mockWithingsAppConfigService.syncToProfile).toHaveBeenCalledWith(profileId)
            expect(result).toEqual(mockProfile)
        })

        it('should create a profile without service accounts when credentials not provided', async () => {
            const dataWithoutCreds = { ...createData }
            delete dataWithoutCreds.garminUsername
            delete dataWithoutCreds.garminPassword
            delete dataWithoutCreds.trainerroadUsername
            delete dataWithoutCreds.trainerroadPassword

            const mockUser = { id: 'user123', displayName: 'Default User' }
            const mockProfile = { id: profileId, name: 'Test Profile', ownerUserId: 'user123' }

            mockPrisma.user.upsert.mockResolvedValue(mockUser)
            mockPrisma.syncProfile.create.mockResolvedValue(mockProfile)

            const result = await profileService.createProfile(dataWithoutCreds)

            expect(mockPrisma.serviceAccount.create).not.toHaveBeenCalled()
            expect(result).toEqual(mockProfile)
        })

        it('should handle errors during profile creation', async () => {
            const error = new Error('Creation failed')
            mockPrisma.user.upsert.mockRejectedValue(error)

            await expect(profileService.createProfile(createData)).rejects.toThrow(error)
            expect(mockLogger.error).toHaveBeenCalled()
        })
    })

    describe('updateProfile', () => {
        const profileId = 'profile123'

        const createTransaction = (initialProfile: any) => {
            const tx = {
                syncProfile: {
                    update: jest.fn()
                },
                serviceAccount: {
                    findFirst: jest.fn(),
                    create: jest.fn(),
                    update: jest.fn(),
                    delete: jest.fn()
                }
            }
            tx.syncProfile.update.mockResolvedValue(initialProfile)
            mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(tx))
            return tx
        }

        it('should create service accounts when complete credentials are provided', async () => {
            const profile = {
                id: profileId,
                ownerUserId: 'user123',
                garminAccountId: null,
                trainerroadAccountId: null
            }
            const tx = createTransaction(profile)
            tx.serviceAccount.findFirst.mockResolvedValue(null)
            tx.serviceAccount.create.mockResolvedValue({id: 'garmin-id'})

            await profileService.updateProfile(profileId, {
                name: 'Updated Profile',
                garminUsername: 'newGarmin',
                garminPassword: 'newPass'
            })

            expect(tx.serviceAccount.create).toHaveBeenCalledWith({
                data: {
                    type: 'garmin',
                    username: 'newGarmin',
                    passwordEncrypted: 'encrypted-password',
                    ownerUserId: 'user123'
                }
            })
            expect(mockCryptoService.encrypt).toHaveBeenCalledWith('newPass')
        })

        it('should remove Garmin service account when both credentials are explicitly cleared', async () => {
            const profile = {
                id: profileId,
                ownerUserId: 'user123',
                garminAccountId: 'garmin-id',
                trainerroadAccountId: null
            }
            const tx = createTransaction(profile)

            await profileService.updateProfile(profileId, {
                garminUsername: null,
                garminPassword: null
            })

            expect(tx.syncProfile.update).toHaveBeenLastCalledWith({
                where: {id: profileId},
                data: {garminAccountId: null},
                include: {ownerUser: true}
            })
            expect(tx.serviceAccount.delete).toHaveBeenCalledWith({where: {id: 'garmin-id'}})
        })

        it('should remove TrainerRoad service account when both credentials are explicitly cleared', async () => {
            const profile = {
                id: profileId,
                ownerUserId: 'user123',
                garminAccountId: null,
                trainerroadAccountId: 'trainerroad-id'
            }
            const tx = createTransaction(profile)

            await profileService.updateProfile(profileId, {
                trainerroadUsername: null,
                trainerroadPassword: null
            })

            expect(tx.syncProfile.update).toHaveBeenLastCalledWith({
                where: {id: profileId},
                data: {trainerroadAccountId: null},
                include: {ownerUser: true}
            })
            expect(tx.serviceAccount.delete).toHaveBeenCalledWith({where: {id: 'trainerroad-id'}})
        })

        it('should preserve the stored password when only the username changes', async () => {
            const profile = {
                id: profileId,
                ownerUserId: 'user123',
                garminAccountId: 'garmin-id',
                trainerroadAccountId: null
            }
            const tx = createTransaction(profile)

            await profileService.updateProfile(profileId, {garminUsername: 'renamed-user'})

            expect(tx.serviceAccount.update).toHaveBeenCalledWith({
                where: {id: 'garmin-id'},
                data: {username: 'renamed-user'}
            })
            expect(mockCryptoService.encrypt).not.toHaveBeenCalled()
        })

        it('should preserve the stored username when only the password changes', async () => {
            const profile = {
                id: profileId,
                ownerUserId: 'user123',
                garminAccountId: null,
                trainerroadAccountId: 'trainerroad-id'
            }
            const tx = createTransaction(profile)

            await profileService.updateProfile(profileId, {trainerroadPassword: 'replacement'})

            expect(tx.serviceAccount.update).toHaveBeenCalledWith({
                where: {id: 'trainerroad-id'},
                data: {passwordEncrypted: 'encrypted-password'}
            })
            expect(mockCryptoService.encrypt).toHaveBeenCalledWith('replacement')
        })

        it('should reject partial credentials when creating a new service account', async () => {
            const profile = {
                id: profileId,
                ownerUserId: 'user123',
                garminAccountId: null,
                trainerroadAccountId: null
            }
            const tx = createTransaction(profile)
            tx.serviceAccount.findFirst.mockResolvedValue(null)

            await expect(profileService.updateProfile(profileId, {
                garminUsername: 'new-user'
            })).rejects.toThrow('Both username and password are required to configure garmin')

            expect(tx.serviceAccount.create).not.toHaveBeenCalled()
        })

        it('should handle errors during profile update', async () => {
            const error = new Error('Update failed')
            mockPrisma.$transaction.mockRejectedValue(error)

            await expect(profileService.updateProfile(profileId, {name: 'Updated'})).rejects.toThrow(error)
            expect(mockLogger.error).toHaveBeenCalledWith(`Failed to update profile ${profileId}`)
        })
    })

    describe('deleteProfile', () => {
        const profileId = 'profile123'
        const mockProfile = { withingsConfigDir: '/path/to/config' }
        const mockRuns = [{ logFilePath: '/path/to/log1.log' }, { logFilePath: '/path/to/log2.log' }]

        beforeEach(() => {
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue([])
        })

        it('should delete profile and associated files', async () => {
            mockPrisma.syncProfile.findUnique.mockResolvedValue(mockProfile)
            mockPrisma.$transaction.mockImplementation(async (callback: any) => {
                return callback({
                    syncRun: {
                        findMany: jest.fn().mockResolvedValue(mockRuns),
                        deleteMany: jest.fn()
                    },
                    syncProfile: {
                        delete: jest.fn()
                    }
                })
            })

            const result = await profileService.deleteProfile(profileId)

            expect(mockPrisma.syncProfile.findUnique).toHaveBeenCalledWith({
                where: { id: profileId },
                select: { withingsConfigDir: true }
            })

            expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2)
            expect(mockFs.rmSync).toHaveBeenCalledWith('/path/to/config', { recursive: true, force: true })
            expect(result).toBe(true)
        })

        it('should handle errors during profile deletion', async () => {
            const error = new Error('Delete failed')
            mockPrisma.syncProfile.findUnique.mockRejectedValue(error)

            await expect(profileService.deleteProfile(profileId)).rejects.toThrow(error)
            expect(mockLogger.error).toHaveBeenCalledWith(`Failed to delete profile ${profileId}`)
        })
    })

    describe('toggleProfile', () => {
        const profileId = 'profile123'
        const mockProfile = { id: profileId, name: 'Test Profile', enabled: true }

        it('should enable/disable a profile', async () => {
            mockPrisma.syncProfile.update.mockResolvedValue(mockProfile)

            const result = await profileService.toggleProfile(profileId, false)

            expect(mockPrisma.syncProfile.update).toHaveBeenCalledWith({
                where: { id: profileId },
                data: { enabled: false },
                include: {
                    ownerUser: true
                }
            })
            expect(result).toEqual(mockProfile)
            expect(mockLogger.info).toHaveBeenCalledWith(`Disabled profile ${profileId}`)
        })

        it('should handle errors during toggle', async () => {
            const error = new Error('Toggle failed')
            mockPrisma.syncProfile.update.mockRejectedValue(error)

            await expect(profileService.toggleProfile(profileId, true)).rejects.toThrow(error)
            expect(mockLogger.error).toHaveBeenCalledWith(`Failed to toggle profile ${profileId}`)
        })
    })

    describe('profileExists', () => {
        const profileId = 'profile123'

        it('should return true if profile exists', async () => {
            mockPrisma.syncProfile.count.mockResolvedValue(1)

            const result = await profileService.profileExists(profileId)

            expect(mockPrisma.syncProfile.count).toHaveBeenCalledWith({
                where: { id: profileId }
            })
            expect(result).toBe(true)
        })

        it('should return false if profile does not exist', async () => {
            mockPrisma.syncProfile.count.mockResolvedValue(0)

            const result = await profileService.profileExists(profileId)

            expect(result).toBe(false)
        })
    })

    describe('getScheduledProfiles', () => {
        it('should fetch profiles with schedules', async () => {
            const mockProfiles = [
                { id: 'profile1', enabled: true, scheduleCron: '0 0 * * *' },
                { id: 'profile2', enabled: true, scheduleCron: '0 12 * * *' }
            ]

            mockPrisma.syncProfile.findMany.mockResolvedValue(mockProfiles)

            const result = await profileService.getScheduledProfiles()

            expect(mockPrisma.syncProfile.findMany).toHaveBeenCalledWith({
                where: {
                    enabled: true,
                    scheduleCron: {
                        not: null
                    }
                },
                include: {
                    ownerUser: true
                }
            })
            expect(result).toEqual(mockProfiles)
        })
    })

    describe('createWithingsConfigDirectory', () => {
        const profileId = 'profile123'
        const configDir = '/path/to/config'

        it('should create config directory for profile', async () => {
            const mockProfile = { withingsConfigDir: configDir }
            
            mockConfigDirectoryService.provideConfigDirectory.mockReturnValue()
            mockConfigDirectoryService.provideProfileDirectory.mockReturnValue(configDir)
            mockPrisma.syncProfile.update.mockResolvedValue(mockProfile)

            const result = await profileService.createWithingsConfigDirectory(profileId)

            expect(mockConfigDirectoryService.provideConfigDirectory).toHaveBeenCalled()
            expect(mockConfigDirectoryService.provideProfileDirectory).toHaveBeenCalledWith(profileId)
            expect(mockPrisma.syncProfile.update).toHaveBeenCalledWith({
                where: { id: profileId },
                data: { withingsConfigDir: configDir }
            })
            expect(result).toBe(configDir)
        })
    })

    describe('resetProfileSessions', () => {
        const profileId = 'profile123'
        const configDir = '/path/to/config'

        it('should delete all session files', async () => {
            const mockProfile = { id: profileId, withingsConfigDir: configDir }
            const mockFiles = ['file1.json', 'file2.json', 'subdir']
            const mockFs = require('fs')

            jest.spyOn(profileService, 'getProfileById').mockResolvedValue(mockProfile as any)
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(mockFiles)
            mockFs.statSync
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => false })
                .mockReturnValueOnce({ isDirectory: () => true })

            await profileService.resetProfileSessions(profileId)

            expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2)
            expect(mockFs.rmSync).toHaveBeenCalledWith(
                require('path').join(configDir, 'subdir'),
                { recursive: true, force: true }
            )
        })

        it('should handle missing profile', async () => {
            jest.spyOn(profileService, 'getProfileById').mockResolvedValue(null)

            await profileService.resetProfileSessions(profileId)

            expect(mockLogger.warn).toHaveBeenCalledWith(`No config directory found for profile ${profileId}`)
        })
    })

    describe('updateConfigDirectory', () => {
        const profileId = 'profile123'
        const configDir = '/path/to/config/profile123'

        it('should update config directory and sync withings config', async () => {
            mockPrisma.syncProfile.update.mockResolvedValue({})

            await profileService.updateConfigDirectory(profileId, configDir)

            expect(mockPrisma.syncProfile.update).toHaveBeenCalledWith({
                where: { id: profileId },
                data: { withingsConfigDir: configDir }
            })
            expect(mockWithingsAppConfigService.syncToProfile).toHaveBeenCalledWith('profile123')
        })
    })
})
