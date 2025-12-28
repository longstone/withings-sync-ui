import prisma from '@/db/prisma'
import {ConfigDirectoryService} from '@/services/ConfigDirectoryService'
import {WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {SettingsService} from '@/services/SettingsService'
import {createProfileService} from '@/services/ProfileService'
import {RunService} from '@/services/RunService'
import {SchedulerService} from '@/services/SchedulerService'
import {WithingsSyncRunner} from '@/services/WithingsSyncRunner'
import {CryptoService} from '@/services/CryptoService'
import {FastifyLogger, LoggerService} from '@/services/LoggerService'
import {LogDirectoryService} from "@/services/LogDirectoryService";

export class Services {
    private configDirectoryService!: ConfigDirectoryService
    private logDirectoryService!: LogDirectoryService
    private withingsAppConfigService!: WithingsAppConfigService
    private settingsService!: SettingsService
    private profileService!: ReturnType<typeof createProfileService>
    private runService!: RunService
    private schedulerService!: SchedulerService
    private withingsSyncRunner!: WithingsSyncRunner
    private cryptoService!: CryptoService
    private logger!: LoggerService

    initialize(): Services {
        const dataDir: string = process.env.DATA_DIR || '/app/data/'
        this.logDirectoryService = new LogDirectoryService(dataDir);
        this.logger = new LoggerService(this.logDirectoryService);
        this.runService = new RunService(this.logger, this.logDirectoryService);
        this.configDirectoryService = new ConfigDirectoryService(this.logger, dataDir);
        this.cryptoService = new CryptoService(this.configDirectoryService, this.logger)
        this.withingsAppConfigService = new WithingsAppConfigService(prisma, this.configDirectoryService, this.cryptoService, this.logger)
        this.settingsService = new SettingsService(prisma, this.withingsAppConfigService, this.cryptoService, this.logger)
        this.profileService = createProfileService(this.cryptoService, this.withingsAppConfigService, this.configDirectoryService, this.logger)
        this.withingsSyncRunner = new WithingsSyncRunner(this.runService, this.profileService, this.cryptoService, this.withingsAppConfigService)
        this.schedulerService = new SchedulerService(this.profileService, this.runService, this.withingsSyncRunner, this.logger)

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

    // Get logger instance
    getLogger(): LoggerService {
        return this.logger
    }

    // Initialize logger with Fastify logger
    initializeLoggerWithFastify(fastifyLogger: FastifyLogger): void {
        this.logger.setFastifyLogger(fastifyLogger)
    }
}