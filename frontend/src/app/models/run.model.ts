import { SyncProfile } from './profile.model'

export interface SyncRun {
  id: string
  syncProfileId: string
  syncProfile?: SyncProfile
  mode: RunMode
  status: RunStatus
  startedAt: string
  finishedAt?: string | null
  exitCode?: number | null
  logFilePath?: string | null
  errorMessage?: string | null
}

export enum RunMode {
  MANUAL = 'MANUAL',
  CRON = 'CRON'
}

export enum RunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED'
}

export interface WebSocketMessage {
  type: 'stdout' | 'stderr' | 'stdin' | 'status' | 'error' | 'close' | 'auth_url'
  data?: string
  timestamp?: string
  runId?: string
}
