import * as schedule from 'node-schedule'
import { RunMode } from '../types/enums'
import { ProfileService } from './ProfileService'
import { RunService } from './RunService'
import { WithingsSyncRunner } from './WithingsSyncRunner'
import { logger } from '../utils/logger'
import { randomWeeklyCronOnDay, randomMinute, randomHour } from '../utils/random'

export interface SchedulerStatus {
  running: boolean
  scheduledJobs: number
  nextRuns: Array<{
    profileId: string
    profileName: string
    nextRun: Date
    cronExpression: string
  }>
}

export class SchedulerService {
  private scheduledJobs: Map<string, schedule.Job> = new Map()
  private resolvedCronExpressions: Map<string, string> = new Map()
  private isRunning: boolean = false
  private reconciliationInterval: NodeJS.Timeout | null = null
  private cleanupJob: schedule.Job | null = null
  private profileService: ProfileService
  private runService: RunService
  private withingsSyncRunner: WithingsSyncRunner

  constructor(
    profileService: ProfileService,
    runService: RunService,
    withingsSyncRunner: WithingsSyncRunner
  ) {
    this.profileService = profileService
    this.runService = runService
    this.withingsSyncRunner = withingsSyncRunner
  }

  // Initialize scheduler and load all scheduled profiles
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing scheduler service')
      
      // Clean up any orphaned runs from previous crashes
      await this.cleanupOrphanedRuns()
      
      // Load and schedule all enabled profiles
      await this.refreshSchedules()
      
      // Start reconciliation loop (every 5 minutes)
      this.startReconciliationLoop()
      
      // Schedule weekly cleanup job (runs every Sunday at 2 AM)
      this.scheduleWeeklyCleanup()
      
      this.isRunning = true
      logger.info(`Scheduler initialized with ${this.scheduledJobs.size} scheduled jobs`)
      
    } catch (error) {
      logger.error('Failed to initialize scheduler', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  // Resolve random placeholders in cron expression
  private resolveRandomPlaceholders(cronExpression: string): string {
    const parts = cronExpression.split(' ')
    
    // Replace ? with random values for minute and hour positions
    if (parts[0] === '?') {
      parts[0] = randomMinute().toString()
    }
    if (parts[1] === '?') {
      parts[1] = randomHour().toString()
    }
    
    return parts.join(' ')
  }

  // Schedule a specific profile
  async scheduleProfile(profileId: string, cronExpression: string): Promise<void> {
    try {
      // Validate cron expression (allow ? placeholder)
      if (!this.isValidCronExpression(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`)
      }

      // Get profile details
      const profile = await this.profileService.getProfileById(profileId)
      if (!profile) {
        throw new Error(`Profile ${profileId} not found`)
      }

      if (!profile.enabled) {
        throw new Error(`Profile ${profileId} is disabled`)
      }

      // Remove existing job if any
      this.unscheduleProfile(profileId)

      // Resolve any random placeholders
      const resolvedCronExpression = this.resolveRandomPlaceholders(cronExpression)
      
      // Store the resolved expression
      this.resolvedCronExpressions.set(profileId, resolvedCronExpression)
      
      // Log the resolved cron for debugging
      if (cronExpression !== resolvedCronExpression) {
        logger.info(`Resolved random cron: ${cronExpression} -> ${resolvedCronExpression}`)
      }

      // Create new scheduled job
      const job = schedule.scheduleJob(resolvedCronExpression, async () => {
        await this.executeScheduledRun(profileId)
      })

      if (!job) {
        throw new Error(`Failed to schedule job for profile ${profileId}`)
      }

      this.scheduledJobs.set(profileId, job)
      logger.info(`Scheduled profile ${profile.name} (${profileId}) with cron: ${resolvedCronExpression}`)
      
    } catch (error) {
      logger.error(`Failed to schedule profile ${profileId}`, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  // Unschedule a specific profile
  unscheduleProfile(profileId: string): void {
    const job = this.scheduledJobs.get(profileId)
    if (job) {
      job.cancel()
      this.scheduledJobs.delete(profileId)
      this.resolvedCronExpressions.delete(profileId)
      logger.info(`Unscheduled profile ${profileId}`)
    }
  }

  // Get schedule info for a specific profile
  getProfileScheduleInfo(profileId: string): { originalCron: string | null, resolvedCron: string | null, nextRun: Date | null } {
    const job = this.scheduledJobs.get(profileId)
    const resolvedCron = this.resolvedCronExpressions.get(profileId) || null
    
    // We need to get the original cron from the profile service
    // For now, return what we have
    return {
      originalCron: null, // Will be filled by the route handler
      resolvedCron,
      nextRun: job?.nextInvocation() || null
    }
  }

  // Refresh all schedules from database
  async refreshSchedules(): Promise<void> {
    try {
      logger.info('Refreshing schedules from database')
      
      // Get all scheduled profiles
      const scheduledProfiles = await this.profileService.getScheduledProfiles()
      
      // Clear existing jobs
      for (const [profileId] of this.scheduledJobs) {
        this.unscheduleProfile(profileId)
      }

      // Schedule all enabled profiles
      for (const profile of scheduledProfiles) {
        if (profile.scheduleCron) {
          try {
            await this.scheduleProfile(profile.id, profile.scheduleCron)
          } catch (error) {
            logger.error(`Failed to schedule profile ${profile.id}: ${error}`)
          }
        }
      }

      logger.info(`Refreshed schedules: ${this.scheduledJobs.size} active jobs`)
      
    } catch (error) {
      logger.error('Failed to refresh schedules', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  // Get scheduler status
  getStatus(): SchedulerStatus {
    const nextRuns: Array<{
      profileId: string
      profileName: string
      nextRun: Date
      cronExpression: string
    }> = []

    for (const [profileId, job] of this.scheduledJobs) {
      if (job.nextInvocation()) {
        nextRuns.push({
          profileId,
          profileName: `Profile ${profileId}`, // We could fetch name but this is more efficient
          nextRun: job.nextInvocation()!,
          cronExpression: job.schedule?.toString() || 'Unknown'
        })
      }
    }

    return {
      running: this.isRunning,
      scheduledJobs: this.scheduledJobs.size,
      nextRuns: nextRuns.sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())
    }
  }

  // Shutdown scheduler gracefully
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down scheduler service')
      
      this.isRunning = false
      
      // Stop reconciliation loop
      if (this.reconciliationInterval) {
        clearInterval(this.reconciliationInterval)
        this.reconciliationInterval = null
      }

      // Cancel cleanup job
      if (this.cleanupJob) {
        this.cleanupJob.cancel()
        this.cleanupJob = null
      }

      // Cancel all scheduled jobs
      for (const [profileId, job] of this.scheduledJobs) {
        job.cancel()
        logger.info(`Cancelled scheduled job for profile ${profileId}`)
      }
      
      this.scheduledJobs.clear()
      logger.info('Scheduler shutdown completed')
      
    } catch (error) {
      logger.error('Error during scheduler shutdown', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  // Execute a scheduled run
  private async executeScheduledRun(profileId: string): Promise<void> {
    try {
      logger.info(`Executing scheduled run for profile ${profileId}`)
      
      // Check if profile is already running
      if (await this.runService.isProfileRunning(profileId)) {
        logger.warn(`Skipping scheduled run for profile ${profileId}: profile already running`)
        return
      }

      // Get profile details
      const profile = await this.profileService.getProfileById(profileId)
      if (!profile || !profile.enabled) {
        logger.warn(`Skipping scheduled run for profile ${profileId}: profile not found or disabled`)
        return
      }

      // Create a new run
      const run = await this.runService.createRun({
        syncProfileId: profileId,
        mode: RunMode.CRON
      })

      // Execute the sync
      const result = await this.withingsSyncRunner.runSync(profileId, run.id, {
        interactive: false,
        timeout: 10 * 60 * 1000 // 10 minutes timeout for scheduled runs
      })

      if (result.success) {
        logger.info(`Scheduled run completed successfully for profile ${profileId}`)
      } else {
        logger.error(`Scheduled run failed for profile ${profileId}: ${result.errorMessage}`)
      }
      
    } catch (error) {
      logger.error(`Scheduled run execution failed for profile ${profileId}`, error instanceof Error ? error.message : String(error))
    }
  }

  // Clean up orphaned runs (runs that are still RUNNING from previous crashes)
  private async cleanupOrphanedRuns(): Promise<void> {
    try {
      logger.info('Cleaning up orphaned runs')
      
      const runningRuns = await this.runService.getRunsByStatus('RUNNING' as any)
      let cleanedCount = 0
      
      for (const run of runningRuns) {
        // Consider runs orphaned if they've been running for more than 30 minutes
        const runAge = Date.now() - new Date(run.startedAt!).getTime()
        if (runAge > 30 * 60 * 1000) {
          await this.runService.failRun(run.id, 'Run marked as failed due to application restart')
          cleanedCount++
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} orphaned runs`)
      }
      
    } catch (error) {
      logger.error('Failed to cleanup orphaned runs', error instanceof Error ? error.message : String(error))
    }
  }

  // Start reconciliation loop to sync DB state with scheduled jobs
  private startReconciliationLoop(): void {
    this.reconciliationInterval = setInterval(async () => {
      try {
        await this.refreshSchedules()
      } catch (error) {
        logger.error('Error during schedule reconciliation', error instanceof Error ? error.message : String(error))
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  // Schedule weekly cleanup job
  private scheduleWeeklyCleanup(): void {
    // Run every Sunday at a random time (between 0:00 and 5:59 AM)
    // This distributes load across different instances/environments
    const cronExpression = randomWeeklyCronOnDay(0) // 0 = Sunday
    this.cleanupJob = schedule.scheduleJob(cronExpression, async () => {
      try {
        logger.info('Starting weekly cleanup of old runs and log files')
        const result = await this.runService.cleanupOldRuns(30) // Clean up runs older than 30 days
        logger.info(`Weekly cleanup completed: deleted ${result.deletedRuns} runs and ${result.deletedLogFiles} log files`)
      } catch (error) {
        logger.error('Weekly cleanup failed', error instanceof Error ? error.message : String(error))
      }
    })
    
    if (this.cleanupJob) {
      logger.info(`Scheduled weekly cleanup job with cron at: ${cronExpression}`)
    } else {
      logger.error(`Failed to schedule weekly cleanup job with cron at: ${cronExpression} (NO CLEANUP IN PLACE)`)
    }
  }

  // Validate cron expression
  private isValidCronExpression(cronExpression: string): boolean {
    try {
      // Allow ? placeholder by replacing all occurrences with valid values for validation
      const testExpression = cronExpression.replace(/\?/g, '0')
      schedule.scheduleJob(testExpression, () => {})
      return true
    } catch {
      return false
    }
  }
}
