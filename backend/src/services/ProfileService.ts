import prisma from '../db/prisma'
import {logger} from '../utils/logger'
import {CryptoService} from '../services/CryptoService'
import {existsSync, unlinkSync, rmSync} from 'fs'
import {WithingsAppConfigService} from './WithingsAppConfigService'
import {randomUUID} from 'crypto'
import {ConfigDirectoryService} from "./ConfigDirectoryService";



export interface CreateProfileData {
    name: string
    ownerUserId: string
    garminAccountId?: string
    garminUsername?: string
    garminPassword?: string
    trainerroadAccountId?: string
    trainerroadUsername?: string
    trainerroadPassword?: string
    enabled?: boolean
    enableBloodPressure?: boolean
    scheduleCron?: string
}

export interface UpdateProfileData {
    name?: string
    garminAccountId?: string | null
    garminUsername?: string | null
    garminPassword?: string | null
    trainerroadAccountId?: string | null
    trainerroadUsername?: string | null
    trainerroadPassword?: string | null
    enabled?: boolean
    enableBloodPressure?: boolean
    scheduleCron?: string | null
    withingsConfigDir?: string
}

export class ProfileService {
    constructor(
        private cryptoService: CryptoService,
        private withingsAppConfigService?: WithingsAppConfigService,
        private configDirectoryService?: ConfigDirectoryService,
    ) {
    }

    // Get all profiles for a user
    async getProfilesByUserId(ownerUserId: string) {
        try {
            return await prisma.syncProfile.findMany({
                where: {ownerUserId},
                include: {
                    ownerUser: true,
                    runs: {
                        orderBy: {startedAt: 'desc'},
                        take: 5 // Last 5 runs
                    }
                }
            })
        } catch (error) {
            logger.error(`Failed to fetch profiles for user ${ownerUserId}`)
            throw error
        }
    }

    // Get all profiles (admin/default view)
    async getAllProfiles() {
        try {
            return  await prisma.syncProfile.findMany({
                include: {
                    ownerUser: true,
                    runs: {
                        orderBy: {startedAt: 'desc'},
                        take: 5
                    }
                }
            })
        } catch (error) {
            logger.error('Failed to fetch all profiles')
            throw error
        }
    }

    // Get single profile by ID
    async getProfileById(id: string) {
        try {
            return await prisma.syncProfile.findUnique({
                where: {id},
                include: {
                    ownerUser: true,
                    runs: {
                        orderBy: {startedAt: 'desc'}
                    }
                }
            })
        } catch (error) {
            logger.error(`Failed to fetch profile ${id}`)
            throw error
        }
    }

    // Create new profile
    async createProfile(data: CreateProfileData) {
        try {
            logger.info(`Creating profile for user ${data.ownerUserId}`)
            
            // Use individual queries instead of transaction to avoid SQLite_READONLY_DBMOVED error
            // Ensure the user exists
            logger.info(`Ensuring user exists: ${data.ownerUserId}`)
            await prisma.user.upsert({
                where: {id: data.ownerUserId},
                update: {},
                create: {
                    id: data.ownerUserId,
                    displayName: data.ownerUserId === 'default-user' ? 'Default User' : data.ownerUserId,
                },
            })
            logger.info(`User ensured: ${data.ownerUserId}`)

            // Extract credential fields from data
            const {garminUsername, garminPassword, trainerroadUsername, trainerroadPassword, ...profileData} = data

            // Generate profile ID for config directory
            const newProfileId = randomUUID()
            logger.info(`Creating profile with ID: ${newProfileId}`)

            // Create the profile
            const newProfile = await prisma.syncProfile.create({
                data: {
                    ...profileData,
                    id: newProfileId,
                    withingsConfigDir: `/app/data/withings-config/${newProfileId}`, // Use profile ID and correct Docker volume path
                    enabled: data.enabled ?? true
                },
                include: {
                    ownerUser: true
                }
            })
            logger.info(`Profile created in database: ${newProfile.id}`)

            // Create Garmin ServiceAccount if credentials provided
            let garminAccountId = null
            if (garminUsername && garminPassword) {
                logger.info(`Creating Garmin service account`)
                const garminAccount = await prisma.serviceAccount.create({
                    data: {
                        type: 'garmin',
                        username: garminUsername,
                        passwordEncrypted: this.cryptoService.encrypt(garminPassword),
                        ownerUserId: data.ownerUserId
                    }
                })
                garminAccountId = garminAccount.id
                logger.info(`Garmin account created: ${garminAccountId}`)
            }

            // Create TrainerRoad ServiceAccount if credentials provided
            let trainerroadAccountId = null
            if (trainerroadUsername && trainerroadPassword) {
                logger.info(`Creating TrainerRoad service account`)
                const trainerroadAccount = await prisma.serviceAccount.create({
                    data: {
                        type: 'trainerroad',
                        username: trainerroadUsername,
                        passwordEncrypted: this.cryptoService.encrypt(trainerroadPassword),
                        ownerUserId: data.ownerUserId
                    }
                })
                trainerroadAccountId = trainerroadAccount.id
                logger.info(`TrainerRoad account created: ${trainerroadAccountId}`)
            }

            // Update profile with service account IDs if any were created
            if (garminAccountId || trainerroadAccountId) {
                logger.info(`Updating profile with service account IDs`)
                const updatedProfile = await prisma.syncProfile.update({
                    where: {id: newProfile.id},
                    data: {
                        garminAccountId,
                        trainerroadAccountId
                    },
                    include: {
                        ownerUser: true
                    }
                })
                logger.info(`Profile updated with service accounts`)
                
                logger.info(`Created profile ${updatedProfile.id} for user ${data.ownerUserId}`)

                // Sync withings_app.json to new profile if configured
                if (this.withingsAppConfigService) {
                    logger.info(`Syncing Withings config to profile ${updatedProfile.id}`)
                    await this.withingsAppConfigService.syncToProfile(updatedProfile.id)
                    logger.info(`Withings config synced to profile ${updatedProfile.id}`)
                }

                return updatedProfile
            }

            logger.info(`Created profile ${newProfile.id} for user ${data.ownerUserId}`)

            // Sync withings_app.json to new profile if configured
            if (this.withingsAppConfigService) {
                logger.info(`Syncing Withings config to profile ${newProfile.id}`)
                await this.withingsAppConfigService.syncToProfile(newProfile.id)
                logger.info(`Withings config synced to profile ${newProfile.id}`)
            }

            return newProfile
        } catch (error: any) {
            logger.error(`Failed to create profile for user ${data.ownerUserId}: ${error.message}`)
            logger.error(error.stack || 'No stack trace')
            throw error
        }
    }

    // Update profile
    async updateProfile(id: string, data: UpdateProfileData) {
        try {
            const profile = await prisma.$transaction(async (tx) => {
                // Extract credential fields from data
                const {garminUsername, garminPassword, trainerroadUsername, trainerroadPassword, ...profileData} = data

                // Update the profile
                let updatedProfile = await tx.syncProfile.update({
                    where: {id},
                    data: profileData,
                    include: {
                        ownerUser: true
                    }
                })

                // Handle Garmin credentials
                if ((garminUsername !== undefined || garminPassword !== undefined) && (garminUsername || garminPassword)) {
                    if (garminUsername && garminPassword) {
                        // Find existing Garmin ServiceAccount for this user
                        const existingGarminAccount = await tx.serviceAccount.findFirst({
                            where: {
                                type: 'garmin',
                                ownerUserId: updatedProfile.ownerUserId
                            }
                        })

                        let garminAccount
                        if (existingGarminAccount) {
                            // Update existing ServiceAccount
                            garminAccount = await tx.serviceAccount.update({
                                where: {id: existingGarminAccount.id},
                                data: {
                                    username: garminUsername,
                                    passwordEncrypted: this.cryptoService.encrypt(garminPassword)
                                }
                            })
                        } else {
                            // Create new ServiceAccount
                            garminAccount = await tx.serviceAccount.create({
                                data: {
                                    type: 'garmin',
                                    username: garminUsername,
                                    passwordEncrypted: this.cryptoService.encrypt(garminPassword),
                                    ownerUserId: updatedProfile.ownerUserId
                                }
                            })
                        }

                        // Update profile with ServiceAccount ID
                        updatedProfile = await tx.syncProfile.update({
                            where: {id},
                            data: {garminAccountId: garminAccount.id},
                            include: {ownerUser: true}
                        })
                    } else if (!garminUsername && !garminPassword) {
                        // Delete existing ServiceAccount if both are empty/null
                        if (updatedProfile.garminAccountId) {
                            await tx.serviceAccount.delete({
                                where: {id: updatedProfile.garminAccountId}
                            })
                            // Clear the reference
                            updatedProfile = await tx.syncProfile.update({
                                where: {id},
                                data: {garminAccountId: null},
                                include: {ownerUser: true}
                            })
                        }
                    }
                }

                // Handle TrainerRoad credentials
                if ((trainerroadUsername !== undefined || trainerroadPassword !== undefined) && (trainerroadUsername || trainerroadPassword)) {
                    if (trainerroadUsername && trainerroadPassword) {
                        // Find existing TrainerRoad ServiceAccount for this user
                        const existingTrainerroadAccount = await tx.serviceAccount.findFirst({
                            where: {
                                type: 'trainerroad',
                                ownerUserId: updatedProfile.ownerUserId
                            }
                        })

                        let trainerroadAccount
                        if (existingTrainerroadAccount) {
                            // Update existing ServiceAccount
                            trainerroadAccount = await tx.serviceAccount.update({
                                where: {id: existingTrainerroadAccount.id},
                                data: {
                                    username: trainerroadUsername,
                                    passwordEncrypted: this.cryptoService.encrypt(trainerroadPassword)
                                }
                            })
                        } else {
                            // Create new ServiceAccount
                            trainerroadAccount = await tx.serviceAccount.create({
                                data: {
                                    type: 'trainerroad',
                                    username: trainerroadUsername,
                                    passwordEncrypted: this.cryptoService.encrypt(trainerroadPassword),
                                    ownerUserId: updatedProfile.ownerUserId
                                }
                            })
                        }

                        // Update profile with ServiceAccount ID
                        updatedProfile = await tx.syncProfile.update({
                            where: {id},
                            data: {trainerroadAccountId: trainerroadAccount.id},
                            include: {ownerUser: true}
                        })
                    } else if (!trainerroadUsername && !trainerroadPassword) {
                        // Delete existing ServiceAccount if both are empty/null
                        if (updatedProfile.trainerroadAccountId) {
                            await tx.serviceAccount.delete({
                                where: {id: updatedProfile.trainerroadAccountId}
                            })
                            // Clear the reference
                            updatedProfile = await tx.syncProfile.update({
                                where: {id},
                                data: {trainerroadAccountId: null},
                                include: {ownerUser: true}
                            })
                        }
                    }
                }

                return updatedProfile
            })

            logger.info(`Updated profile ${id}`)
            return profile
        } catch (error) {
            logger.error(`Failed to update profile ${id}`)
            throw error
        }
    }

    // Delete profile
    async deleteProfile(id: string) {
        const runLogPaths: string[] = []

        try {
            // Get profile info before deletion to retrieve config directory
            const profile = await prisma.syncProfile.findUnique({
                where: { id },
                select: { withingsConfigDir: true }
            })

            // Clear any persisted session/auth files before removing profile
            await this.resetProfileSessions(id)

            await prisma.$transaction(async tx => {
                const runs = await tx.syncRun.findMany({
                    where: {syncProfileId: id},
                    select: {logFilePath: true}
                })

                for (const run of runs) {
                    if (run.logFilePath) {
                        runLogPaths.push(run.logFilePath)
                    }
                }

                await tx.syncRun.deleteMany({
                    where: {syncProfileId: id}
                })

                await tx.syncProfile.delete({
                    where: {id}
                })
            })

            // Remove associated log files after DB cleanup
            for (const logPath of runLogPaths) {
                if (existsSync(logPath)) {
                    try {
                        unlinkSync(logPath)
                    } catch (error) {
                        logger.warn(`Failed to delete log file ${logPath} for profile ${id}`)
                    }
                }
            }

            // Remove the withings config directory
            if (profile?.withingsConfigDir) {
                if (existsSync(profile.withingsConfigDir)) {
                    try {
                        rmSync(profile.withingsConfigDir, { recursive: true, force: true })
                        logger.info(`Deleted withings config directory for profile ${id}: ${profile.withingsConfigDir}`)
                    } catch (error) {
                        logger.warn(`Failed to delete config directory ${profile.withingsConfigDir} for profile ${id}`)
                    }
                }
            }

            logger.info(`Deleted profile ${id}`)
            return true
        } catch (error) {
            logger.error(`Failed to delete profile ${id}`)
            throw error
        }
    }

    // Enable/disable profile
    async toggleProfile(id: string, enabled: boolean) {
        try {
            const profile = await prisma.syncProfile.update({
                where: {id},
                data: {enabled},
                include: {
                    ownerUser: true
                }
            })

            logger.info(`${enabled ? 'Enabled' : 'Disabled'} profile ${id}`)
            return profile
        } catch (error) {
            logger.error(`Failed to toggle profile ${id}`)
            throw error
        }
    }

    // Check if profile exists
    async profileExists(id: string) {
        try {
            const count = await prisma.syncProfile.count({
                where: {id}
            })
            return count > 0
        } catch (error) {
            logger.error(`Failed to check if profile ${id} exists`)
            throw error
        }
    }

    // Get profiles that are enabled and have a schedule (for cron jobs)
    async getScheduledProfiles() {
        try {
            return await prisma.syncProfile.findMany({
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
        } catch (error) {
            logger.error('Failed to fetch scheduled profiles')
            throw error
        }
    }

    // Create withings config directory for profile
    async createWithingsConfigDirectory(profileId: string) {
        try {
            this.configDirectoryService?.provideConfigDirectory();
            const configDir = this.configDirectoryService?.provideProfileDirectory(profileId)

            // Update profile with config directory path
            const result = await prisma.syncProfile.update({
                where: {id: profileId},
                data: {withingsConfigDir: configDir}
            })

            logger.info(`Created withings config directory for profile ${result.ownerUserId}: ${result.withingsConfigDir}`)
            return configDir
        } catch (error) {
            logger.error(`Failed to create withings config directory for profile ${profileId}`)
            throw error
        }
    }

    // Reset profile sessions (delete all auth files)
    async resetProfileSessions(profileId: string) {
        try {
            const fs = require('fs')
            const path = require('path')

            const profile = await this.getProfileById(profileId)
            if (!profile || !profile.withingsConfigDir) {
                logger.warn(`No config directory found for profile ${profileId}`)
                return
            }

            const configDir = profile.withingsConfigDir

            // Check if directory exists
            if (fs.existsSync(configDir)) {
                // Delete all files in the directory
                const files = fs.readdirSync(configDir)
                for (const file of files) {
                    const filePath = path.join(configDir, file)
                    const stat = fs.statSync(filePath)

                    if (stat.isDirectory()) {
                        // Recursively delete subdirectories
                        fs.rmSync(filePath, {recursive: true, force: true})
                    } else {
                        // Delete files
                        fs.unlinkSync(filePath)
                    }
                }

                logger.info(`Deleted all session files for profile ${profileId} from ${configDir}`)
            }
        } catch (error) {
            logger.error(`Failed to reset sessions for profile ${profileId}`, error instanceof Error ? error.message : String(error))
            throw error
        }
    }

    // Update config directory for a profile (used during onboarding)
    async updateConfigDirectory(profileId: string, configDir: string) {
        try {
            await prisma.syncProfile.update({
                where: {id: profileId},
                data: {withingsConfigDir: configDir}
            })

            // Sync withings_app.json to the new config directory if configured
            if (this.withingsAppConfigService) {
                // Extract profile ID from path (last segment)
                const profileIdFromPath = configDir.split('/').pop() || configDir.split('\\').pop()
                if (profileIdFromPath) {
                    await this.withingsAppConfigService.syncToProfile(profileIdFromPath)
                }
            }

            logger.info(`Updated config directory for profile ${profileId} to ${configDir}`)
        } catch (error) {
            logger.error(`Failed to update config directory for profile ${profileId}`)
            throw error
        }
    }
}

// Export factory function to create instance with dependencies
export function createProfileService(cryptoService: CryptoService, withingsAppConfigService?: WithingsAppConfigService, configDirectoryService?: ConfigDirectoryService) {
    return new ProfileService(cryptoService, withingsAppConfigService, configDirectoryService)
}
