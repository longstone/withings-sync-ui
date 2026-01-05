import {FastifyInstance} from 'fastify'
import {RunMode} from '@/types/enums'

export default async function profilesRoutes(fastify: FastifyInstance) {
    const profileService = fastify.services.getProfileService();
    const runService = fastify.services.getRunService();
    const withingsSyncRunner = fastify.services.getWithingsSyncRunner();
    const schedulerService = fastify.services.getSchedulerService();
    // Get all profiles
    fastify.get('/profiles', async (request, reply) => {
        try {
            const {userId} = request.query as { userId?: string }
            const profiles = userId
                ? await profileService.getProfilesByUserId(userId)
                : await profileService.getAllProfiles()

            // Add schedule information to each profile
            for (const profile of profiles) {
                if (profile.scheduleCron) {
                    const scheduleInfo = schedulerService.getProfileScheduleInfo(profile.id)
                    const augmented = profile as any
                    augmented.originalCron = profile.scheduleCron
                    augmented.resolvedCron = scheduleInfo.resolvedCron
                    augmented.nextRunTime = scheduleInfo.nextRun
                }
            }

            return {profiles}
        } catch (error) {
            fastify.log.error(error)
            reply.code(500)
            return {error: 'Failed to fetch profiles'}
        }
    })

    // Get single profile
    fastify.get('/profiles/:id', async (request, reply) => {
        try {
            const {id} = request.params as { id: string }
            const profile = await profileService.getProfileById(id)

            // Add schedule information if available
            if (profile && profile.scheduleCron) {
                const scheduleInfo = schedulerService.getProfileScheduleInfo(id)
                const augmented = profile as any
                augmented.originalCron = profile.scheduleCron
                augmented.resolvedCron = scheduleInfo.resolvedCron
                augmented.nextRunTime = scheduleInfo.nextRun
            }

            return {profile}
        } catch (error) {
            fastify.log.error(error)
            reply.code(500)
            return {error: 'Failed to fetch profile'}
        }
    })

    // Create profile
    fastify.post('/profiles', async (request, reply) => {
        try {
            const profileData = request.body as any
            fastify.log.info('Creating profile with data:', profileData)

            // For now, use a default user ID since we don't have authentication yet
            const userId = profileData.ownerUserId || 'default-user'
            fastify.log.info(`Using userId: ${userId}`)

            const profile = await profileService.createProfile({
                ...profileData,
                ownerUserId: userId
            })
            fastify.log.info(`Profile created successfully: ${profile.id}`)

            // Create withings config directory
            await profileService.createWithingsConfigDirectory(profile.id)
            fastify.log.info('Withings config directory created')

            reply.code(201)
            return {profile}
        } catch (error: any) {
            fastify.log.error('Failed to create profile:')
            fastify.log.error(error)
            fastify.log.error('Stack trace:')
            fastify.log.error(error.stack)
            reply.code(500)
            return {error: 'Failed to create profile', details: error.message}
        }
    })

    // Update profile
    fastify.put('/profiles/:id', async (request, reply) => {
        try {
            const {id} = request.params as { id: string }
            const profileData = request.body as any
            const profile = await profileService.updateProfile(id, profileData)

            // Update scheduler if profile has cron expression
            if (profile.enabled && profile.scheduleCron) {
                try {
                    await schedulerService.scheduleProfile(id, profile.scheduleCron)
                    fastify.log.info(`Scheduled profile ${id} with cron: ${profile.scheduleCron}`)
                } catch (error) {
                    fastify.log.error(`Failed to schedule profile ${id}: ${error}`)
                }
            } else if (!profile.enabled) {
                // Unschedule if disabled
                schedulerService.unscheduleProfile(id, true)
                fastify.log.info(`Unscheduled disabled profile ${id}`)
            }

            return {profile}
        } catch (error) {
            fastify.log.error(error)
            reply.code(500)
            return {error: 'Failed to update profile'}
        }
    })

    // Delete profile
    fastify.delete('/profiles/:id', async (request, reply) => {
        try {
            const {id} = request.params as { id: string }
            schedulerService.unscheduleProfile(id, true)
            await profileService.deleteProfile(id)
            return {success: true}
        } catch (error) {
            fastify.log.error(error)
            reply.code(500)
            return {error: 'Failed to delete profile'}
        }
    })

    // Enable/disable profile
    fastify.route({
        method: ['PATCH', 'PUT'],
        url: '/profiles/:id/toggle',
        handler: async (request, reply) => {
            try {
                const {id} = request.params as { id: string }
                const {enabled} = request.body as { enabled: boolean }
                const profile = await profileService.toggleProfile(id, enabled)

                // Update scheduler based on new state
                if (enabled && profile.scheduleCron) {
                    try {
                        await schedulerService.scheduleProfile(id, profile.scheduleCron)
                        fastify.log.info(`Scheduled enabled profile ${id} with cron: ${profile.scheduleCron}`)
                    } catch (error) {
                        fastify.log.error(`Failed to schedule profile ${id}: ${error}`)
                    }
                } else {
                    // Unschedule if disabled or no cron
                    schedulerService.unscheduleProfile(id, true)
                    fastify.log.info(`Unscheduled profile ${id}`)
                }

                return {profile}
            } catch (error) {
                fastify.log.error(error)
                reply.code(500)
                return {error: 'Failed to toggle profile'}
            }
        }
    })

    // Reset profile sessions (delete all auth files)
    fastify.delete('/profiles/:id/sessions', async (request, reply) => {
        try {
            const {id} = request.params as { id: string }

            // Get profile
            const profile = await profileService.getProfileById(id)
            if (!profile) {
                reply.code(404)
                return {error: 'Profile not found'}
            }

            // Unschedule the profile to prevent failed runs
            await schedulerService.unscheduleProfile(id, true)

            // Delete session files
            await profileService.resetProfileSessions(id)

            // Disable the profile to prevent scheduled runs until re-authentication
            await profileService.updateProfile(id, {enabled: false})

            fastify.log.info(`Reset sessions for profile ${id}`)
            return {message: 'Session files reset successfully. Profile has been disabled until re-authentication.'}
        } catch (error) {
            fastify.log.error(error)
            reply.code(500)
            return {error: 'Failed to reset sessions'}
        }
    })

    // Start interactive run
    fastify.post('/profiles/:id/run-interactive', async (request, reply) => {
        try {
            const {id} = request.params as { id: string }
            const {logLevel} = request.body as { logLevel?: 'debug' | 'info' | 'warn' | 'error' }
            // Check if withings-sync CLI is available
            if (!(await withingsSyncRunner.checkCliAvailability())) {
                reply.code(503)
                return {error: 'withings-sync CLI is not available on this server'}
            }

            // Check if profile exists and is enabled
            if (!(await profileService.profileExists(id))) {
                reply.code(404)
                return {error: 'Profile not found'}
            }

            // Check if profile is already running
            const existingRun = await runService.getRunningRunForProfile(id)
            if (existingRun) {
                // If there's already a running run, reuse it
                reply.code(200)
                return {
                    sessionId: existingRun.id,
                    runId: existingRun.id,
                    message: 'Existing run resumed. Connect to WebSocket endpoint to continue interactive session.'
                }
            }

            // Create a new run record
            const run = await runService.createRun({
                syncProfileId: id,
                mode: RunMode.MANUAL,
                logLevel: (logLevel || 'info') as any
            })

            // Return run ID as session ID for WebSocket connection
            reply.code(201)
            return {
                sessionId: run.id,
                runId: run.id,
                message: 'Run created. Connect to WebSocket endpoint to start interactive session.'
            }
        } catch (error) {
            fastify.log.error(error)
            reply.code(500)
            return {error: 'Failed to start interactive run'}
        }
    })
}
