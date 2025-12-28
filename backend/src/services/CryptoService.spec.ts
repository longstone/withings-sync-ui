import {CryptoService} from '@/services/CryptoService'
import {LoggerService} from '@/services/LoggerService'
import {join} from 'path'
import * as fs from 'fs'

// Mock the fs module
jest.mock('fs')
const mockedFs = jest.mocked(fs, { shallow: false })

// Mock ConfigDirectoryService
class MockConfigDirectoryService {
  private configDir: string
  private keyFileExists: boolean = false
  private keyFileContent: string = ''

  constructor() {
    this.configDir = '/mock/config/dir'
  }

  provideConfigDirectory() {
    // Mock implementation - does nothing
  }

  provideProfileDirectory(profileId: string): string {
    return join(this.configDir, profileId)
  }

  getConfigDirectory() {
    return this.configDir
  }

  isConfigDirectoryExisting() {
    return true
  }

  // Helper methods for testing
  setKeyFileExists(exists: boolean) {
    this.keyFileExists = exists
    mockedFs.existsSync.mockImplementation((path: fs.PathLike) => {
      const pathStr = path.toString()
      if (pathStr.includes('.sync-secret-key')) {
        return this.keyFileExists
      }
      return true
    })
  }

  setKeyFileContent(content: string) {
    this.keyFileContent = content
    mockedFs.readFileSync.mockImplementation((path: fs.PathOrFileDescriptor) => {
      const pathStr = path.toString()
      if (pathStr.includes('.sync-secret-key')) {
        return this.keyFileContent
      }
      return ''
    })
  }

  captureWrittenKey() {
    let writtenKey = ''
    mockedFs.writeFileSync.mockImplementation((path: fs.PathOrFileDescriptor, data: string | ArrayBufferView) => {
      const pathStr = path.toString()
      if (pathStr.includes('.sync-secret-key')) {
        writtenKey = data.toString()
      }
    })
    return () => writtenKey
  }
}

describe('CryptoService', () => {
  let cryptoService: CryptoService
  let mockConfigService: MockConfigDirectoryService
  let mockLogger: jest.Mocked<LoggerService>
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.SYNC_SECRET_KEY
    
    // Set up default fs mocks
    mockedFs.existsSync.mockReturnValue(true)
    mockedFs.mkdirSync.mockImplementation(() => undefined)
    mockedFs.readdirSync.mockReturnValue([])
    mockedFs.readFileSync.mockReturnValue('')
    mockedFs.writeFileSync.mockImplementation(() => {})
    
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      writeLog: jest.fn(),
      setFastifyLogger: jest.fn(),
      createRunLogger: jest.fn(),
      readRunLogs: jest.fn()
    } as any
    
    // Create mock service
    mockConfigService = new MockConfigDirectoryService()
    
    // Mock console.log to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  describe('encrypt/decrypt', () => {
    beforeEach(() => {
      // Set up mock to generate a new key
      mockConfigService.setKeyFileExists(false)
      const getWrittenKey = mockConfigService.captureWrittenKey()
      cryptoService = new CryptoService(mockConfigService as any, mockLogger)
      // Verify a key was generated
      expect(getWrittenKey()).toMatch(/^[a-f0-9]{64}$/)
    })
    it('should encrypt and decrypt text correctly', () => {
      const testText = 'test-password-123'
      const encrypted = cryptoService.encrypt(testText)
      const decrypted = cryptoService.decrypt(encrypted)
      expect(decrypted).toBe(testText)
    })

    it('should handle different text values', () => {
      const testCases = [
        'hello world',
        'special-characters-!@#$%^&*()',
        'unicode-测试-🔒',
        'long-text-'.repeat(100),
        '',
        '1234567890'
      ]
      
      testCases.forEach(testCase => {
        const encrypted = cryptoService.encrypt(testCase)
        const decrypted = cryptoService.decrypt(encrypted)
        expect(decrypted).toBe(testCase)
      })
    })

    it('should produce different encrypted values for the same text', () => {
      const text = 'same-text'
      const encrypted1 = cryptoService.encrypt(text)
      const encrypted2 = cryptoService.encrypt(text)
      
      expect(encrypted1).not.toBe(encrypted2)
      
      const decrypted1 = cryptoService.decrypt(encrypted1)
      const decrypted2 = cryptoService.decrypt(encrypted2)
      expect(decrypted1).toBe(text)
      expect(decrypted2).toBe(text)
    })
  })

  describe('decrypt error handling', () => {
    beforeEach(() => {
      mockConfigService.setKeyFileExists(false)
      cryptoService = new CryptoService(mockConfigService as any, mockLogger)
    })
    it('should throw error for invalid format', () => {
      expect(() => cryptoService.decrypt('invalid-format')).toThrow('Failed to decrypt data')
    })

    it('should throw error for empty string', () => {
      expect(() => cryptoService.decrypt('')).toThrow('Failed to decrypt data')
    })

    it('should throw error for malformed hex', () => {
      expect(() => cryptoService.decrypt('invalid-hex:encrypted-data')).toThrow()
    })
  })

  describe('key management', () => {
    it('should create a key file if none exists', () => {
      mockConfigService.setKeyFileExists(false)
      const getWrittenKey = mockConfigService.captureWrittenKey()
      cryptoService = new CryptoService(mockConfigService as any, mockLogger)
      
      expect(getWrittenKey()).toMatch(/^[a-f0-9]{64}$/)
      // After creating the CryptoService, the key file should exist
      expect(mockedFs.existsSync).toHaveBeenCalledWith(expect.stringContaining('.sync-secret-key'))
    })

    it('should use existing key file if it exists', () => {
      const testKey = 'a'.repeat(64)
      mockConfigService.setKeyFileExists(true)
      mockConfigService.setKeyFileContent(testKey)
      
      cryptoService = new CryptoService(mockConfigService as any, mockLogger)
      
      // Should not write a new key
      expect(mockedFs.writeFileSync).not.toHaveBeenCalled()
    })

    it('should use environment variable if set', () => {
      process.env.SYNC_SECRET_KEY = 'b'.repeat(64)
      
      mockConfigService.setKeyFileExists(false)
      const getWrittenKey = mockConfigService.captureWrittenKey()
      cryptoService = new CryptoService(mockConfigService as any, mockLogger)
      
      // Should not write a key file when using env variable
      expect(getWrittenKey()).toBe('')
    })

    it('should rotate key successfully', () => {
      mockConfigService.setKeyFileExists(false)
      cryptoService = new CryptoService(mockConfigService as any, mockLogger)
      
      const testText = 'test-data'
      const encrypted = cryptoService.encrypt(testText)
      
      // Capture the new key that will be written
      const getNewWrittenKey = mockConfigService.captureWrittenKey()
      
      // Rotate key
      cryptoService.rotateKey()
      
      // Verify a new key was written
      expect(getNewWrittenKey()).toMatch(/^[a-f0-9]{64}$/)
      
      // Old encrypted data should fail to decrypt
      expect(() => cryptoService.decrypt(encrypted)).toThrow()
      
      // New encryption should work
      const newEncrypted = cryptoService.encrypt(testText)
      const decrypted = cryptoService.decrypt(newEncrypted)
      expect(decrypted).toBe(testText)
    })
  })
})
