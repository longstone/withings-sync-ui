import {
  randomInt,
  randomMinute,
  randomHour,
  randomDayOfWeek,
  randomWeeklyCron,
  randomWeeklyCronOnDay,
  randomDailyCron
} from './random'

describe('Random Utils', () => {
  describe('randomInt', () => {
    it('should return a number within the specified range', () => {
      const min = 5
      const max = 10
      const results = new Set<number>()
      
      // Run multiple times to get different values
      for (let i = 0; i < 100; i++) {
        const result = randomInt(min, max)
        expect(result).toBeGreaterThanOrEqual(min)
        expect(result).toBeLessThanOrEqual(max)
        expect(Number.isInteger(result)).toBe(true)
        results.add(result)
      }
      
      // Should eventually get both min and max values
      expect(results.has(min)).toBe(true)
      expect(results.has(max)).toBe(true)
    })

    it('should handle single value range', () => {
      expect(randomInt(5, 5)).toBe(5)
    })

    it('should handle negative numbers', () => {
      const min = -10
      const max = -5
      const results = new Set<number>()
      
      for (let i = 0; i < 100; i++) {
        const result = randomInt(min, max)
        expect(result).toBeGreaterThanOrEqual(min)
        expect(result).toBeLessThanOrEqual(max)
        results.add(result)
      }
      
      expect(results.has(min)).toBe(true)
      expect(results.has(max)).toBe(true)
    })
  })

  describe('randomMinute', () => {
    it('should return a number between 0 and 59', () => {
      const results = new Set<number>()
      
      for (let i = 0; i < 1000; i++) {
        const result = randomMinute()
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(59)
        expect(Number.isInteger(result)).toBe(true)
        results.add(result)
      }
      
      // With 1000 iterations, we should get a good range
      expect(results.size).toBeGreaterThan(10) // Should get at least 10 different values
    })
  })

  describe('randomHour', () => {
    it('should return a number between 0 and 23', () => {
      const results = new Set<number>()
      
      for (let i = 0; i < 200; i++) {
        const result = randomHour()
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(23)
        expect(Number.isInteger(result)).toBe(true)
        results.add(result)
      }
      
      // Should eventually get both 0 and 23
      expect(results.has(0)).toBe(true)
      expect(results.has(23)).toBe(true)
    })
  })

  describe('randomDayOfWeek', () => {
    it('should return a number between 0 and 6', () => {
      const results = new Set<number>()
      
      for (let i = 0; i < 200; i++) {
        const result = randomDayOfWeek()
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThanOrEqual(6)
        expect(Number.isInteger(result)).toBe(true)
        results.add(result)
      }
      
      // Should eventually get all days
      for (let day = 0; day <= 6; day++) {
        expect(results.has(day)).toBe(true)
      }
    })
  })

  describe('randomWeeklyCron', () => {
    it('should generate a valid weekly cron expression', () => {
      const results = new Set<string>()
      
      for (let i = 0; i < 200; i++) {
        const cron = randomWeeklyCron()
        const parts = cron.split(' ')
        
        expect(parts).toHaveLength(5)
        expect(Number(parts[0])).toBeGreaterThanOrEqual(0)
        expect(Number(parts[0])).toBeLessThanOrEqual(59)
        expect(Number(parts[1])).toBeGreaterThanOrEqual(0)
        expect(Number(parts[1])).toBeLessThanOrEqual(23)
        expect(parts[2]).toBe('*')
        expect(parts[3]).toBe('*')
        expect(Number(parts[4])).toBeGreaterThanOrEqual(0)
        expect(Number(parts[4])).toBeLessThanOrEqual(6)
        
        results.add(cron)
      }
      
      // Should generate different expressions
      expect(results.size).toBeGreaterThan(1)
    })
  })

  describe('randomWeeklyCronOnDay', () => {
    it('should generate a weekly cron expression for a specific day', () => {
      const dayOfWeek = 3 // Wednesday
      const results = new Set<string>()
      
      for (let i = 0; i < 100; i++) {
        const cron = randomWeeklyCronOnDay(dayOfWeek)
        const parts = cron.split(' ')
        
        expect(parts).toHaveLength(5)
        expect(Number(parts[0])).toBeGreaterThanOrEqual(0)
        expect(Number(parts[0])).toBeLessThanOrEqual(59)
        expect(Number(parts[1])).toBeGreaterThanOrEqual(0)
        expect(Number(parts[1])).toBeLessThanOrEqual(23)
        expect(parts[2]).toBe('*')
        expect(parts[3]).toBe('*')
        expect(Number(parts[4])).toBe(dayOfWeek)
        
        results.add(cron)
      }
      
      // Should generate different times but same day
      expect(results.size).toBeGreaterThan(1)
      results.forEach(cron => {
        expect(cron.endsWith(` ${dayOfWeek}`)).toBe(true)
      })
    })

    it('should handle all valid days', () => {
      for (let day = 0; day <= 6; day++) {
        const cron = randomWeeklyCronOnDay(day)
        const parts = cron.split(' ')
        expect(Number(parts[4])).toBe(day)
      }
    })
  })

  describe('randomDailyCron', () => {
    it('should generate a valid daily cron expression', () => {
      const results = new Set<string>()
      
      for (let i = 0; i < 100; i++) {
        const cron = randomDailyCron()
        const parts = cron.split(' ')
        
        expect(parts).toHaveLength(5)
        expect(Number(parts[0])).toBeGreaterThanOrEqual(0)
        expect(Number(parts[0])).toBeLessThanOrEqual(59)
        expect(Number(parts[1])).toBeGreaterThanOrEqual(0)
        expect(Number(parts[1])).toBeLessThanOrEqual(23)
        expect(parts[2]).toBe('*')
        expect(parts[3]).toBe('*')
        expect(parts[4]).toBe('*')
        
        results.add(cron)
      }
      
      // Should generate different expressions
      expect(results.size).toBeGreaterThan(1)
    })
  })
})
