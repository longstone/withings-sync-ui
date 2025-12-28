import { FastifyInstance, FastifyRequest } from 'fastify'
import { WebSocket } from '@fastify/websocket'
import { randomUUID } from 'crypto'
import { RunMode, RunStatus } from '@/types/enums'
import { logger } from '@/utils/logger'

export interface WebSocketMessage {
  type: 'stdout' | 'stderr' | 'stdin' | 'status' | 'error' | 'close' | 'auth_url'
  data?: string
  timestamp?: string
  runId?: string
}

export interface ActiveSession {
  sessionId: string
  runId: string
  connection: WebSocket
  profileId: string
  userId: string
  pingInterval?: NodeJS.Timeout
}

export class WebSocketHandler {
  private activeSessions: Map<string, ActiveSession> = new Map()
  private runService: any
  private profileService: any
  private withingsSyncRunner: any

  constructor(private fastify: FastifyInstance) {
    // Get services from the Services instance
    const services = (fastify as any).services
    this.runService = services.getRunService()
    this.profileService = services.getProfileService()
    this.withingsSyncRunner = services.getWithingsSyncRunner()
    
    this.registerRoutes()
  }

  private registerRoutes() {
    // WebSocket route for interactive runs
    this.fastify.register(async (fastify: FastifyInstance) => {
      fastify.get('/ws/interactive/:sessionId', { websocket: true }, (connection: WebSocket, request: FastifyRequest) => {
        this.handleWebSocketConnection(connection, request)
      })
    })
  }

  // Handle WebSocket connection
  private async handleWebSocketConnection(connection: WebSocket, request: FastifyRequest) {
    const { sessionId } = request.params as { sessionId: string }

    try {
      // Validate session ID and get associated run
      const session = await this.validateSession(sessionId)
      if (!session) {
        connection.send(JSON.stringify({
          type: 'error',
          data: 'Invalid or expired session',
          timestamp: new Date().toISOString()
        } as WebSocketMessage))
        connection.close()
        return
      }

      // Send ping periodically to keep connection alive
      const pingInterval = setInterval(() => {
        if (connection.readyState === 1) { // WebSocket.OPEN
          connection.ping()
        } else {
          clearInterval(pingInterval)
        }
      }, 30000) // Ping every 30 seconds

      // Store active session with ping interval
      this.activeSessions.set(sessionId, {
        sessionId,
        runId: session.runId,
        connection,
        profileId: session.profileId,
        userId: session.userId,
        pingInterval
      })

      logger.info(`WebSocket connected for session ${sessionId}, run ${session.runId}`)

      // Send initial status
      connection.send(JSON.stringify({
        type: 'status',
        data: 'connected',
        runId: session.runId,
        timestamp: new Date().toISOString()
      } as WebSocketMessage))

      // Start the interactive run
      await this.startInteractiveRun(session)

      // Handle incoming messages from client
      connection.on('message', this.handleClientMessage.bind(this, sessionId))

      // Handle connection close
      connection.on('close', this.handleConnectionClose.bind(this, sessionId))

      // Handle connection errors
      connection.on('error', (error: Error) => {
        logger.error(`WebSocket error for session ${sessionId}: ${error.message}`)
        const activeSession = this.activeSessions.get(sessionId)
        if (activeSession?.pingInterval) {
          clearInterval(activeSession.pingInterval)
        }
        this.activeSessions.delete(sessionId)
      })

    } catch (error) {
      logger.error(`WebSocket connection failed for session ${sessionId}: ${error}`)
      connection.send(JSON.stringify({
        type: 'error',
        data: 'Connection setup failed',
        timestamp: new Date().toISOString()
      } as WebSocketMessage))
      connection.close()
    }
  }

  // Validate session and get run information
  private async validateSession(sessionId: string): Promise<{ runId: string, profileId: string, userId: string } | null> {
    try {
      // Find the run associated with this session
      const run = await this.runService.getRunById(sessionId)
      
      if (!run) {
        logger.warn(`No run found for session ${sessionId}`)
        return null
      }

      // Check if run is in appropriate state for interactive connection
      if (run.status !== RunStatus.PENDING && run.status !== RunStatus.RUNNING) {
        logger.warn(`Run ${run.id} is in invalid state ${run.status} for interactive connection`)
        return null
      }

      // Check if run is interactive mode
      if (run.mode !== RunMode.MANUAL) {
        logger.warn(`Run ${run.id} is not in manual/interactive mode`)
        return null
      }

      return {
        runId: run.id,
        profileId: run.syncProfileId,
        userId: run.syncProfile.ownerUserId
      }

    } catch (error) {
      logger.error(`Session validation failed for ${sessionId}: ${error}`)
      return null
    }
  }

  // Start interactive run and forward output to WebSocket
  private async startInteractiveRun(session: { runId: string, profileId: string, userId: string }) {
    try {
      const activeSession = this.activeSessions.get(session.runId)
      if (!activeSession) {
        throw new Error('Active session not found')
      }

      // Define output callback to forward CLI output to WebSocket
      const outputCallback = (type: 'stdout' | 'stderr' | 'status' | 'error' | 'auth_url', data: string) => {
        const message: WebSocketMessage = {
          type: type as 'stdout' | 'stderr' | 'status' | 'error' | 'auth_url',
          data,
          runId: session.runId,
          timestamp: new Date().toISOString()
        }

        // Send to WebSocket
        if (activeSession.connection.readyState === 1) { // WebSocket.OPEN
          activeSession.connection.send(JSON.stringify(message))
        }
      }

      // Check if this is a new run or resuming an existing one
      const run = await this.runService.getRunById(session.runId)
      if (run?.status === RunStatus.RUNNING) {
        // Resuming existing run - just send a status message
        outputCallback('status', 'Resumed existing interactive session')
        } else {
          // Start new interactive run with real-time output streaming
          await this.withingsSyncRunner.startInteractiveRun(
            session.profileId,
            session.runId,
            outputCallback,
            this.runService.getRunLogLevel(session.runId) || 'info'
          )
        }

      } catch (error) {
      logger.error(`Interactive run failed for session ${session.runId}: ${error}`)
      
      const activeSession = this.activeSessions.get(session.runId)
      if (activeSession) {
        activeSession.connection.send(JSON.stringify({
          type: 'error',
          data: error instanceof Error ? error.message : 'Run execution failed',
          runId: session.runId,
          timestamp: new Date().toISOString()
        } as WebSocketMessage))
      }
    }
  }

  // Handle messages from WebSocket client
  private handleClientMessage(sessionId: string, message: Buffer | string | Buffer[]) {
    try {
      const activeSession = this.activeSessions.get(sessionId)
      if (!activeSession) {
        return
      }

      // Parse message (expecting JSON with type and data)
      let parsedMessage: WebSocketMessage
      try {
        parsedMessage = JSON.parse(message.toString())
      } catch {
        // If not JSON, treat as raw stdin input
        parsedMessage = {
          type: 'stdin',
          data: message.toString(),
          timestamp: new Date().toISOString()
        }
      }

      // Handle different message types
      switch (parsedMessage.type) {
        case 'stdin':
          if (parsedMessage.data) {
            // Forward input to CLI process
            this.withingsSyncRunner.sendInput(activeSession.runId, sessionId, parsedMessage.data)
            logger.debug(`Forwarded input to run ${activeSession.runId}: ${parsedMessage.data}`)
          }
          break

        default:
          logger.warn(`Unknown message type: ${parsedMessage.type}`)
      }

    } catch (error) {
      logger.error(`Failed to handle client message for session ${sessionId}: ${error}`)
    }
  }

  // Handle WebSocket connection close
  private handleConnectionClose(sessionId: string) {
    try {
      const activeSession = this.activeSessions.get(sessionId)
      if (activeSession) {
        logger.info(`WebSocket disconnected for session ${sessionId}, run ${activeSession.runId}`)

        // Clear ping interval
        if (activeSession.pingInterval) {
          clearInterval(activeSession.pingInterval)
        }

        // Detach from run but don't kill immediately (grace period)
        this.withingsSyncRunner.detachRun(activeSession.runId)

        // Remove from active sessions
        this.activeSessions.delete(sessionId)
      }

    } catch (error) {
      logger.error(`Failed to handle connection close for session ${sessionId}: ${error}`)
    }
  }

  // Send message to specific session
  sendToSession(sessionId: string, message: WebSocketMessage) {
    const activeSession = this.activeSessions.get(sessionId)
    if (activeSession && activeSession.connection.readyState === 1) { // WebSocket.OPEN
      activeSession.connection.send(JSON.stringify(message))
    }
  }

  // Get active sessions for a run
  getActiveSessionsForRun(runId: string): ActiveSession[] {
    return Array.from(this.activeSessions.values()).filter(session => session.runId === runId)
  }

  // Get all active sessions
  getAllActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values())
  }

  // Close all sessions for a run
  closeSessionsForRun(runId: string, reason: string = 'Run completed') {
    const sessions = this.getActiveSessionsForRun(runId)
    sessions.forEach(session => {
      session.connection.send(JSON.stringify({
        type: 'close',
        data: reason,
        runId,
        timestamp: new Date().toISOString()
      } as WebSocketMessage))
      session.connection.close()
    })
  }

  // Generate new session ID
  static generateSessionId(): string {
    return randomUUID()
  }
}

// Factory function to register WebSocket handler
export function registerWebSocketHandler(fastify: FastifyInstance): WebSocketHandler {
  return new WebSocketHandler(fastify)
}
