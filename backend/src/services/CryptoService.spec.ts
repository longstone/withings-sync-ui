import { CryptoService } from '../services/CryptoService'
import { ConfigDirectoryService } from '../services/ConfigDirectoryService'

describe('CryptoService', () => {
  let cryptoService: CryptoService
  let configDirectoryService: ConfigDirectoryService

  beforeEach(() => {
    // Create a new instance with a test directory
    configDirectoryService = new ConfigDirectoryService()
    cryptoService = new CryptoService(configDirectoryService)
  })

  describe('encrypt/decrypt', () => {
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
      expect(cryptoService.hasKeyFile()).toBe(true)
    })

    it('should rotate key successfully', () => {
      const testText = 'test-data'
      const encrypted = cryptoService.encrypt(testText)
      
      // Rotate key
      cryptoService.rotateKey()
      
      // Old encrypted data should fail to decrypt
      expect(() => cryptoService.decrypt(encrypted)).toThrow()
      
      // New encryption should work
      const newEncrypted = cryptoService.encrypt(testText)
      const decrypted = cryptoService.decrypt(newEncrypted)
      expect(decrypted).toBe(testText)
    })
  })
})
