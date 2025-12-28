import prisma from '@/db/prisma'
import {ConfigDirectoryService} from '@/services/ConfigDirectoryService'
import {WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {SettingsService} from '@/services/SettingsService'
import {createProfileService} from '@/services/ProfileService'
import {RunService} from '@/services/RunService'
import {SchedulerService} from '@/services/SchedulerService'
import {WithingsSyncRunner} from '@/services/WithingsSyncRunner'
import {CryptoService} from '@/services/CryptoService'

export class Services {
    private configDirectoryService!: ConfigDirectoryService
    private withingsAppConfigService!: WithingsAppConfigService
    private settingsService!: SettingsService
    private profileService!: ReturnType<typeof createProfileService>
    private runService!: RunService
    private schedulerService!: SchedulerService
    private withingsSyncRunner!: WithingsSyncRunner
    private cryptoService!: CryptoService

    initialize(): Services {
        // Initialize services in dependency order
        this.runService = new RunService();
        this.configDirectoryService = new ConfigDirectoryService();
        this.cryptoService = new CryptoService(this.configDirectoryService)
        this.withingsAppConfigService = new WithingsAppConfigService(prisma, this.configDirectoryService, this.cryptoService)
        this.settingsService = new SettingsService(prisma, this.withingsAppConfigService, this.cryptoService)
        this.profileService = createProfileService(this.cryptoService, this.withingsAppConfigService, this.configDirectoryService)
        this.withingsSyncRunner = new WithingsSyncRunner(this.runService, this.profileService, this.cryptoService, this.withingsAppConfigService)
        this.schedulerService = new SchedulerService(this.profileService, this.runService, this.withingsSyncRunner)

        return this
    }

    // Getters for all services
    getConfigDirectoryService(): ConfigDirectoryService {
        return this.configDirectoryService
    }

    getWithingsAppConfigService(): WithingsAppConfigService {
        return this.withingsAppConfigService
    }

    getSettingsService(): SettingsService {
        return this.settingsService
    }

    getProfileService(): ReturnType<typeof createProfileService> {
        return this.profileService
    }

    getRunService(): RunService {
        return this.runService
    }

    getSchedulerService(): SchedulerService {
        return this.schedulerService
    }

    getWithingsSyncRunner(): WithingsSyncRunner {
        return this.withingsSyncRunner
    }

    getCryptoService(): CryptoService {
        return this.cryptoService
    }

    // Get prisma client
    getPrisma() {
        return prisma
    }
}