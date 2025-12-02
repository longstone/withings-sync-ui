import { SyncRun } from './run.model'

export interface SyncProfile {
  id: string
  name: string
  ownerUserId: string
  withingsConfigDir: string
  garminUsername?: string | null
  garminPassword?: string | null
  garminAccountId?: string | null
  trainerroadUsername?: string | null
  trainerroadPassword?: string | null
  trainerroadAccountId?: string | null
  enabled: boolean
  enableBloodPressure: boolean
  scheduleCron?: string | null
  originalCron?: string | null
  resolvedCron?: string | null
  nextRunTime?: string | null
  createdAt: string
  updatedAt: string
  ownerUser?: User
  runs?: SyncRun[]
}

export interface User {
  id: string
  displayName: string
  createdAt: string
}

export interface CreateProfileData {
  name: string
  ownerUserId: string
  garminUsername?: string
  garminPassword?: string
  trainerroadUsername?: string
  trainerroadPassword?: string
  enabled?: boolean
  enableBloodPressure?: boolean
  scheduleCron?: string
}

export interface UpdateProfileData {
  name?: string
  garminUsername?: string | null
  garminPassword?: string | null
  trainerroadUsername?: string | null
  trainerroadPassword?: string | null
  enabled?: boolean
  enableBloodPressure?: boolean
  scheduleCron?: string | null
  withingsConfigDir?: string
}
