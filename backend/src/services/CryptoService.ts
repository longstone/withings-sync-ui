import {createCipheriv, createDecipheriv, randomBytes} from 'crypto'
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'fs'
import {join} from 'path'
import {logger} from '../utils/logger'
import {ConfigDirectoryService} from './ConfigDirectoryService'

export class CryptoService {
    private static readonly ALGORITHM = 'aes-256-cbc'
    private secretKey: Buffer
    private configDirectoryService: ConfigDirectoryService
    private keyFilePath: string

    constructor(configDirectoryService: ConfigDirectoryService) {
        // Use injected service
        this.configDirectoryService = configDirectoryService

        // Ensure config directory exists
        this.configDirectoryService.provideConfigDirectory()

        // Set key file path in the config directory
        this.keyFilePath = join(this.configDirectoryService.getConfigDirectory(), '.sync-secret-key')

        // Initialize the secret key
        this.secretKey = this.getOrCreateSecretKey()
    }

    private getOrCreateSecretKey(): Buffer {
        // First try environment variable
        const envKey = process.env.SYNC_SECRET_KEY
        if (envKey) {
            logger.debug('Using secret key from environment variable')
            return Buffer.from(envKey, 'hex')
        }

        // Then try to read from file
        if (existsSync(this.keyFilePath)) {
            logger.debug('Using secret key from file')
            const storedKey = readFileSync(this.keyFilePath, 'utf-8').trim()
            return Buffer.from(storedKey, 'hex')
        }

        // Generate new key and persist it
        logger.info('Generating new secret key')
        const newKey = randomBytes(32).toString('hex')

        writeFileSync(this.keyFilePath, newKey)
        logger.info('New secret key generated and saved')
        return Buffer.from(newKey, 'hex')
    }

    encrypt(text: string): string {
        try {
            const iv = randomBytes(16)
            const cipher = createCipheriv(CryptoService.ALGORITHM, this.secretKey, iv)
            let encrypted = cipher.update(text, 'utf8', 'hex')
            encrypted += cipher.final('hex')
            return iv.toString('hex') + ':' + encrypted
        } catch (error) {
            logger.error('Encryption failed:', error instanceof Error ? error.message : String(error))
            throw new Error('Failed to encrypt data')
        }
    }

    decrypt(encryptedText: string): string {
        try {
            const textParts = encryptedText.split(':')
            if (textParts.length !== 2) {
                throw new Error('Invalid encrypted text format')
            }

            const iv = Buffer.from(textParts[0], 'hex')
            const encrypted = textParts[1]
            const decipher = createDecipheriv(CryptoService.ALGORITHM, this.secretKey, iv)
            let decrypted = decipher.update(encrypted, 'hex', 'utf8')
            decrypted += decipher.final('utf8')
            return decrypted
        } catch (error) {
            logger.error('Decryption failed:', error instanceof Error ? error.message : String(error))
            throw new Error('Failed to decrypt data')
        }
    }

    // Method to rotate the encryption key
    rotateKey(): void {
        logger.info('Rotating encryption key')
        const newKey = randomBytes(32).toString('hex')

        writeFileSync(this.keyFilePath, newKey)
        this.secretKey = Buffer.from(newKey, 'hex')
        logger.info('Encryption key rotated successfully')
    }

    // Method to check if key file exists
    hasKeyFile(): boolean {
        return existsSync(this.keyFilePath)
    }

    // Get key file path (for debugging/monitoring)
    getKeyFilePath(): string {
        return this.keyFilePath
    }
}
