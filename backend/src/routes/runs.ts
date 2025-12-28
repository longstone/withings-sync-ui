import { FastifyInstance } from 'fastify'
import {RunService} from "@/services/RunService";

export default async function runsRoutes(fastify: FastifyInstance) {
  const runService: RunService = fastify.services.getRunService()
  // Get all runs
  fastify.get('/runs', async (request, reply) => {
    try {
      const runs = await runService.getAllRuns()
      return { runs }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500)
      return { error: 'Failed to fetch runs' }
    }
  })

  // Get single run
  fastify.get('/runs/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const run = await runService.getRunById(id)
      return { run }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500)
      return { error: 'Failed to fetch run' }
    }
  })

  // Get runs for a specific profile
  fastify.get('/profiles/:profileId/runs', async (request, reply) => {
    try {
      const { profileId } = request.params as { profileId: string }
      const runs = await runService.getRunsByProfileId(profileId)
      return { runs }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500)
      return { error: 'Failed to fetch profile runs' }
    }
  })

  // Get run logs
  fastify.get('/runs/:id/logs', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const logs = await runService.getRunLogs(id)
      return { logs: logs.join('\n'), runId: id }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500)
      return { error: 'Failed to fetch run logs' }
    }
  })

  // Get recent runs
  fastify.get('/runs/recent', async (request, reply) => {
    try {
      const { limit } = request.query as { limit?: string }
      const limitNum = limit ? parseInt(limit, 10) : 50
      const runs = await runService.getRecentRuns(limitNum)
      return { runs }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500)
      return { error: 'Failed to fetch recent runs' }
    }
  })

  // Cancel a run (mark as failed)
  fastify.post('/runs/:id/cancel', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      await runService.cancelRun(id)
      reply.code(200)
      return { success: true }
    } catch (error) {
      fastify.log.error(error)
      reply.code(500)
      return { error: 'Failed to cancel run' }
    }
  })
}
