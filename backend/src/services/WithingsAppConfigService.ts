import {existsSync, unlinkSync, writeFileSync} from 'fs'
import {join} from 'path'
import {CryptoService} from '@/services/CryptoService'
import {LoggerService} from '@/services/LoggerService'
import {PrismaClient, Settings} from "@/db/prisma-client-generated/client";
import {ConfigDirectoryService} from "@/services/ConfigDirectoryService";

export interface WithingsAppConfig {
    client_id: string
    consumer_secret: string
    callback_url?: string
}

export class WithingsAppConfigService {
    private logger: LoggerService

    constructor(
        private prisma: PrismaClient,
        private configDirectoryService: ConfigDirectoryService,
        private cryptoService: CryptoService,
        logger: LoggerService
    ) {
        this.logger = logger
    }

    /**
     * Update Withings app configuration and write to all profile directories
     */
    async updateWithingsAppConfig(clientId: string, consumerSecret: string, callbackUrl?: string): Promise<void> {
        // Encrypt the consumer secret before storing
        const encryptedSecret = this.cryptoService.encrypt(consumerSecret)

        // Update in database
        await this.prisma.settings.update({
            where: {id: 'global'},
            data: {
                withingsClientId: clientId,
                withingsConsumerSecret: encryptedSecret,
                withingsCallbackUrl: callbackUrl || null
            }
        })

        // Write config files to all profile directories
        await this.writeWithingsAppFiles(clientId, consumerSecret, callbackUrl)

        this.logger.info('Withings app configuration updated and written to all profiles')
    }

    /**
     * Remove Withings app configuration from database and all profile directories
     */
    async deleteWithingsAppConfig(): Promise<void> {
        // Update database to remove credentials
        await this.prisma.settings.update({
            where: {id: 'global'},
            data: {
                withingsClientId: null,
                withingsConsumerSecret: null,
                withingsCallbackUrl: null
            }
        })

        // Delete config files from all profile directories
        await this.deleteWithingsAppFiles()

        this.logger.info('Withings app configuration removed from all profiles')
    }

    /**
     * Write withings_app.json to all existing profile directories
     */
    async writeWithingsAppFiles(clientId: string, consumerSecret: string, callbackUrl?: string): Promise<void> {


        this.configDirectoryService.provideConfigDirectory()

        // Get all profile directories
        const profileDirs = await this.getProfileDirectories()

        const config: WithingsAppConfig = {
            client_id: clientId,
            consumer_secret: consumerSecret,
            ...(callbackUrl && { callback_url: callbackUrl })
        }

        // Write to each profile directory
        for (const profileDir of profileDirs) {
            const configPath = join(profileDir, 'withings_app.json')
            writeFileSync(configPath, JSON.stringify(config, null, 2), {mode: 0o600})
            this.logger.debug(`Wrote withings_app.json to ${profileDir}`)
        }
    }

    /**
     * Delete withings_app.json from all profile directories
     */
    async deleteWithingsAppFiles(): Promise<void> {
        const profileDirs = await this.getProfileDirectories()

        for (const profileDir of profileDirs) {
            const configPath = join(profileDir, 'withings_app.json')
            if (existsSync(configPath)) {
                unlinkSync(configPath)
                this.logger.debug(`Deleted withings_app.json from ${profileDir}`)
            }
        }
    }

    /**
     * Write withings_app.json to a specific profile directory
     */
    async syncToProfile(profileId: string): Promise<void> {
        // Get current settings
        const settings: Settings | null = await this.prisma.settings.findUnique({
            where: {id: 'global'}
        })

        if (settings == null || !this.hasWithingsAppConfig(settings)) {
            // No config to write
            return
        }

        // Decrypt the consumer secret
        let consumerSecret:string = this.getConsumerSecret(settings);
        // checked in hasWithingsAppConfig
        let withingsClientId: string = settings.withingsClientId as string;
        let callbackUrl: string | undefined = settings.withingsCallbackUrl || undefined;
        // Create profile directory if it doesn't exist
        const profileDir = this.configDirectoryService.provideProfileDirectory(profileId);

        // Write config file
        const config: WithingsAppConfig = {
            client_id: withingsClientId,
            consumer_secret: consumerSecret,
            ...(callbackUrl && { callback_url: callbackUrl })
        }

        const configPath = join(profileDir, 'withings_app.json')
        writeFileSync(configPath, JSON.stringify(config, null, 2), {mode: 0o600})

        this.logger.debug(`Synced withings_app.json to profile ${profileId}`)
    }

    private getConsumerSecret(settings: Settings): string {
        const secret = settings?.withingsConsumerSecret || ''
        if (secret.length === 0) {
            throw new Error(`Failed to decrypt withingsConsumerSecret: it's empty`)
        }
        try {
            return this.cryptoService.decrypt(secret)
        } catch (error) {
            this.logger.error(`Failed to decrypt consumerSecret: ${error}`)
            throw new Error(`Failed to decrypt Withings consumer secret: ${error}`)
        }
    }

    /**
     * Get all profile directories
     */
    private async getProfileDirectories(): Promise<string[]> {
        return this.configDirectoryService.getConfigDirectoryFolders();
    }

    /**
     * Check if Withings app configuration exists
     */
    hasWithingsAppConfig(settings: Settings): boolean {
        return !!(settings?.withingsClientId && settings?.withingsConsumerSecret)
    }
}
