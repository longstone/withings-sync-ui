/**
 * Random utility functions
 */

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Generate a random minute value between 0 and 59
 */
export function randomMinute(): number {
  return randomInt(0, 59)
}

/**
 * Generate a random hour value between 0 and 23
 */
export function randomHour(): number {
  return randomInt(0, 23)
}

/**
 * Generate a random day of week (0-6, where 0 = Sunday)
 */
export function randomDayOfWeek(): number {
  return randomInt(0, 6)
}

/**
 * Generate a random cron expression for weekly execution
 * Randomizes the day of week, hour, and minute
 */
export function randomWeeklyCron(): string {
  const minute = randomMinute()
  const hour = randomHour()
  const dayOfWeek = randomDayOfWeek()
  return `${minute} ${hour} * * ${dayOfWeek}`
}

/**
 * Generate a cron expression for weekly execution on a specific day
 * with random hour and minute
 */
export function randomWeeklyCronOnDay(dayOfWeek: number): string {
  const minute = randomMinute()
  const hour = randomHour()
  return `${minute} ${hour} * * ${dayOfWeek}`
}

/**
 * Generate a random cron expression for daily execution
 * Randomizes the hour and minute
 */
export function randomDailyCron(): string {
  const minute = randomMinute()
  const hour = randomHour()
  return `${minute} ${hour} * * *`
}
