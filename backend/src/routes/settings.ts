import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { SettingsService, UpdateSettingsData } from '@/services/SettingsService'

export default async function settingsRoutes(fastify: FastifyInstance) {
  const settingsService = fastify.services.getSettingsService() as SettingsService

  // Get all settings
  fastify.get('/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await settingsService.getSettings()
      return reply.send(settings)
    } catch (error: any) {
      fastify.log.error('Failed to get settings:')
      fastify.log.error(error)
      fastify.log.error('Stack trace:')
      fastify.log.error(error.stack)
      return reply.status(500).send({ error: 'Failed to retrieve settings', details: error.message })
    }
  })

  // Update settings
  fastify.put('/settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          logLevel: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          withingsCallbackUrl: { type: 'string' },
          withingsClientId: { type: 'string', minLength: 1 },
          withingsConsumerSecret: { type: 'string', minLength: 1 },
          withingsCustomApp: { type: 'boolean' },
          apiTimeout: { type: 'integer', minimum: 5, maximum: 300 },
          timeFormat: { type: 'string', enum: ['12h', '24h'] },
          dateFormat: { type: 'string', enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY'] }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest<{ Body: UpdateSettingsData }>, reply: FastifyReply) => {
    try {
      const settings = await settingsService.updateSettings(request.body)
      return reply.send(settings)
    } catch (error: any) {
      fastify.log.error('Failed to update settings:')
      fastify.log.error(error)
      
      if (error.message === 'Both client ID and consumer secret must be provided or removed together') {
        return reply.status(400).send({ error: error.message })
      }
      
      return reply.status(500).send({ error: 'Failed to update settings' })
    }
  })

  // Remove Withings app configuration
  fastify.delete('/settings/withings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await settingsService.removeWithingsConfig()
      return reply.send(settings)
    } catch (error) {
      fastify.log.error('Failed to remove Withings config:')
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to remove Withings app configuration' })
    }
  })

  // Check if Withings app configuration exists
  fastify.get('/settings/withings/exists', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const hasConfig = await settingsService.getDecryptedWithingsConfig()
      return reply.send({ exists: !!hasConfig })
    } catch (error) {
      fastify.log.error('Failed to check Withings config:')
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to check Withings app configuration' })
    }
  })

  // Save Withings app configuration
  fastify.post('/settings/withings-app', {
    schema: {
      body: {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              callback_url: { type: 'string' },
              client_id: { type: 'string' },
              consumer_secret: { type: 'string' }
            },
            required: ['callback_url', 'client_id', 'consumer_secret']
          }
        },
        required: ['config']
      }
    }
  }, async (request: FastifyRequest<{ Body: { config: { callback_url: string; client_id: string; consumer_secret: string } } }>, reply: FastifyReply) => {
    try {
      await settingsService.saveWithingsAppConfig(request.body.config)
      return reply.send({ success: true })
    } catch (error: any) {
      fastify.log.error('Failed to save Withings app config:')
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to save Withings app configuration' })
    }
  })

  // Delete Withings app configuration
  fastify.delete('/settings/withings-app', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await settingsService.removeWithingsConfig()
      return reply.send({ success: true })
    } catch (error) {
      fastify.log.error('Failed to delete Withings app config:')
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to delete Withings app configuration' })
    }
  })
}
