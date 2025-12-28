import {CryptoService} from '@/services/CryptoService'
import {WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {logger} from '@/utils/logger'
import {PrismaClient} from "@/db/prisma-client-generated/client";

export interface Settings {
  // System settings
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  withingsCallbackUrl?: string
  withingsClientId?: string
  withingsConsumerSecret?: string // Never returned decrypted
  withingsCustomApp: boolean
  
  // UI preferences
  apiTimeout: number
  timeFormat: '12h' | '24h'
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD.MM.YYYY'
  
  updatedAt: Date
}

export interface UpdateSettingsData {
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  withingsCallbackUrl?: string
  withingsClientId?: string
  withingsConsumerSecret?: string
  withingsCustomApp?: boolean
  apiTimeout?: number
  timeFormat?: '12h' | '24h'
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD.MM.YYYY'
}

export class SettingsService {
  constructor(
    private prisma: PrismaClient,
    private withingsAppConfigService: WithingsAppConfigService,
    private cryptoService: CryptoService
  ) {}

  /**
   * Get all settings
   */
  async getSettings(): Promise<Settings> {
    let settings = await this.prisma.settings.findUnique({
      where: { id: 'global' }
    })

    // Create default settings if they don't exist
    if (!settings) {
      settings = await this.createDefaultSettings()
    }

    // Return settings without decrypting secrets
    return {
      logLevel: settings.logLevel as Settings['logLevel'],
      withingsCallbackUrl: settings.withingsCallbackUrl || undefined,
      withingsClientId: settings.withingsClientId || undefined,
      withingsConsumerSecret: settings.withingsConsumerSecret || undefined,
      withingsCustomApp: settings.withingsCustomApp,
      apiTimeout: settings.apiTimeout,
      timeFormat: settings.timeFormat as Settings['timeFormat'],
      dateFormat: settings.dateFormat as Settings['dateFormat'],
      updatedAt: settings.updatedAt
    }
  }

  /**
   * Update settings
   */
  async updateSettings(data: UpdateSettingsData): Promise<Settings> {
    const currentSettings = await this.getSettings()
    const updateData: any = { ...data }

    // Handle Withings app configuration changes
    const hasWithingsChanges = data.withingsClientId !== undefined || 
                              data.withingsConsumerSecret !== undefined ||
                              data.withingsCustomApp !== undefined ||
                              data.withingsCallbackUrl !== undefined

    if (hasWithingsChanges) {
      const newClientId = data.withingsClientId || currentSettings.withingsClientId
      const newSecret = data.withingsConsumerSecret || currentSettings.withingsConsumerSecret
      const newEnabled = data.withingsCustomApp !== undefined ? data.withingsCustomApp : currentSettings.withingsCustomApp
      const newCallbackUrl = data.withingsCallbackUrl !== undefined ? data.withingsCallbackUrl : currentSettings.withingsCallbackUrl

      // Write file if enabled and credentials are provided
      if (newEnabled && newClientId && newSecret) {
        await this.withingsAppConfigService.updateWithingsAppConfig(
          newClientId,
          newSecret,
          newCallbackUrl
        )
      } 
      // Delete file if disabled or credentials are missing
      else if (!newEnabled || !newClientId || !newSecret) {
        await this.withingsAppConfigService.deleteWithingsAppConfig()
      }

      // Validate that if credentials are provided, both must be present
      if ((newClientId && !newSecret) || (!newClientId && newSecret)) {
        throw new Error('Both client ID and consumer secret must be provided or removed together')
      }

      // Encrypt the secret for database storage
      if (data.withingsConsumerSecret) {
        updateData.withingsConsumerSecret = this.cryptoService.encrypt(data.withingsConsumerSecret)
      }
    }

    // Update settings in database
    const updated = await this.prisma.settings.upsert({
      where: { id: 'global' },
      update: updateData,
      create: {
        id: 'global',
        ...updateData
      }
    })

    logger.info('Settings updated', undefined, undefined)

    // Return updated settings without decrypting secrets
    return {
      logLevel: updated.logLevel as Settings['logLevel'],
      withingsCallbackUrl: updated.withingsCallbackUrl || undefined,
      withingsClientId: updated.withingsClientId || undefined,
      withingsConsumerSecret: updated.withingsConsumerSecret || undefined,
      withingsCustomApp: updated.withingsCustomApp,
      apiTimeout: updated.apiTimeout,
      timeFormat: updated.timeFormat as Settings['timeFormat'],
      dateFormat: updated.dateFormat as Settings['dateFormat'],
      updatedAt: updated.updatedAt
    }
  }

  /**
   * Get decrypted Withings app configuration (for internal use)
   */
  async getDecryptedWithingsConfig(): Promise<{ clientId: string; consumerSecret: string } | null> {
    const settings = await this.prisma.settings.findUnique({
      where: { id: 'global' }
    })

    if (!settings?.withingsClientId || !settings?.withingsConsumerSecret) {
      return null
    }

    return {
      clientId: settings.withingsClientId,
      consumerSecret: this.cryptoService.decrypt(settings.withingsConsumerSecret)
    }
  }

  /**
   * Save Withings app configuration to file
   */
  async saveWithingsAppConfig(config: { callback_url: string; client_id: string; consumer_secret: string }): Promise<void> {
    await this.withingsAppConfigService.updateWithingsAppConfig(
      config.client_id,
      config.consumer_secret,
      config.callback_url
    )
  }

  /**
   * Remove Withings app configuration
   */
  async removeWithingsConfig(): Promise<void> {
    await this.withingsAppConfigService.deleteWithingsAppConfig()
  }

  /**
   * Create default settings
   */
  private async createDefaultSettings() {
    return this.prisma.settings.create({
      data: {
        id: 'global',
        logLevel: 'info',
        apiTimeout: 30,
        timeFormat: '24h',
        dateFormat: 'DD/MM/YYYY',
        withingsCustomApp: false
      }
    })
  }

  /**
   * Update log level dynamically
   */
  async updateLogLevel(logLevel: Settings['logLevel']): Promise<void> {
    await this.prisma.settings.update({
      where: { id: 'global' },
      data: { logLevel }
    })

    logger.info(`Log level updated to ${logLevel}`, undefined, undefined)
  }
}

