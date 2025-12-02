// TypeScript enum definitions for SQLite string fields
// These provide type safety while SQLite doesn't support native enums

export const RunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED'
} as const

export type RunStatus = typeof RunStatus[keyof typeof RunStatus]

export const RunMode = {
  MANUAL: 'MANUAL',
  CRON: 'CRON'
} as const

export type RunMode = typeof RunMode[keyof typeof RunMode]

export const ServiceAccountType = {
  GARMIN: 'garmin',
  TRAINERROAD: 'trainerroad'
} as const

export type ServiceAccountType = typeof ServiceAccountType[keyof typeof ServiceAccountType]
