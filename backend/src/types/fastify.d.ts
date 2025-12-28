import {Services} from '@/services/Services'

declare module 'fastify' {
    export interface FastifyInstance {
        services: Services
    }

    export interface FastifyRequest {
        // Add any custom request properties here if needed
    }

    export interface FastifyReply {
        // Add any custom reply properties here if needed
    }
}
