import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

interface ScheduleProfileBody {
  profileId: string
  cronExpression: string
}

interface ScheduleProfileParams {
  profileId: string
}

export default async function schedulerRoutes(fastify: FastifyInstance) {
  const schedulerService = fastify.services.getSchedulerService()
  // Get scheduler status
  fastify.get('/scheduler/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = schedulerService.getStatus()
      return {
        success: true,
        data: status
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to get scheduler status')
      reply.code(500)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Refresh all schedules from database
  fastify.post('/scheduler/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await schedulerService.refreshSchedules()
      const status = schedulerService.getStatus()
      return {
        success: true,
        message: 'Schedules refreshed successfully',
        data: status
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to refresh schedules')
      reply.code(500)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Schedule a specific profile
  fastify.post('/scheduler/schedule', {
    schema: {
      body: {
        type: 'object',
        required: ['profileId', 'cronExpression'],
        properties: {
          profileId: { type: 'string' },
          cronExpression: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: ScheduleProfileBody }>, reply: FastifyReply) => {
    try {
      const { profileId, cronExpression } = request.body
      
      await schedulerService.scheduleProfile(profileId, cronExpression)
      
      return {
        success: true,
        message: `Profile ${profileId} scheduled successfully`,
        data: {
          profileId,
          cronExpression
        }
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to schedule profile')
      reply.code(400)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Unschedule a specific profile
  fastify.delete('/scheduler/schedule/:profileId', {
    schema: {
      params: {
        type: 'object',
        required: ['profileId'],
        properties: {
          profileId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: ScheduleProfileParams }>, reply: FastifyReply) => {
    try {
      const { profileId } = request.params
      
      schedulerService.unscheduleProfile(profileId)
      
      return {
        success: true,
        message: `Profile ${profileId} unscheduled successfully`,
        data: {
          profileId
        }
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to unschedule profile')
      reply.code(500)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Health check for scheduler
  fastify.get('/scheduler/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = schedulerService.getStatus()
      
      return {
        success: true,
        data: {
          status: status.running ? 'healthy' : 'stopped',
          running: status.running,
          scheduledJobs: status.scheduledJobs,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      fastify.log.error({ err: error }, 'Scheduler health check failed')
      reply.code(503)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      }
    }
  })
}
