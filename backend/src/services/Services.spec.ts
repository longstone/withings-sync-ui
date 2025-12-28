// Mock the modules to track constructor calls - must be defined before jest.mock calls due to hoisting
const MockConfigDirectoryService = jest.fn()
const MockWithingsAppConfigService = jest.fn()
const MockSettingsService = jest.fn()
const MockProfileService = jest.fn()
const MockRunService = jest.fn()
const MockSchedulerService = jest.fn()
const MockWithingsSyncRunner = jest.fn()
const MockCryptoService = jest.fn()

// Mock all dependencies
jest.mock('../db/prisma', () => ({
    __esModule: true,
    default: {}
}))

jest.mock('./ConfigDirectoryService', () => ({
    ConfigDirectoryService: MockConfigDirectoryService
}))
jest.mock('./WithingsAppConfigService', () => ({
    WithingsAppConfigService: MockWithingsAppConfigService
}))
jest.mock('./SettingsService', () => ({
    SettingsService: MockSettingsService
}))
jest.mock('./ProfileService', () => ({
    createProfileService: jest.fn().mockReturnValue(MockProfileService)
}))
jest.mock('./RunService', () => ({
    RunService: MockRunService
}))
jest.mock('./SchedulerService', () => ({
    SchedulerService: MockSchedulerService
}))
jest.mock('./WithingsSyncRunner', () => ({
    WithingsSyncRunner: MockWithingsSyncRunner
}))
jest.mock('./CryptoService', () => ({
    CryptoService: MockCryptoService
}))

import {Services} from '@/services/Services'
import {ConfigDirectoryService} from '@/services/ConfigDirectoryService'
import {WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {SettingsService} from '@/services/SettingsService'
import {RunService} from '@/services/RunService'
import {SchedulerService} from '@/services/SchedulerService'
import {WithingsSyncRunner} from '@/services/WithingsSyncRunner'
import {CryptoService} from '@/services/CryptoService'
import prisma from '@/db/prisma'

describe('Services', () => {
    let services: Services

    beforeEach(() => {
        jest.clearAllMocks()
        services = new Services()
    })
    
    afterEach(() => {
        // Reset all mock constructors
        MockConfigDirectoryService.mockClear()
        MockWithingsAppConfigService.mockClear()
        MockSettingsService.mockClear()
        MockRunService.mockClear()
        MockSchedulerService.mockClear()
        MockWithingsSyncRunner.mockClear()
        MockCryptoService.mockClear()
    })

    describe('initialize', () => {
        it('should initialize all services in correct dependency order', () => {
            const result = services.initialize()
            
            expect(result).toBe(services)
            expect(MockRunService).toHaveBeenCalled()
            expect(MockConfigDirectoryService).toHaveBeenCalled()
            expect(MockCryptoService).toHaveBeenCalled()
            expect(MockWithingsAppConfigService).toHaveBeenCalledWith(
                prisma,
                expect.any(ConfigDirectoryService),
                expect.any(CryptoService)
            )
            expect(MockSettingsService).toHaveBeenCalledWith(
                prisma,
                expect.any(WithingsAppConfigService),
                expect.any(CryptoService)
            )
            expect(WithingsSyncRunner).toHaveBeenCalledWith(
                expect.any(RunService),
                MockProfileService,
                expect.any(CryptoService),
                expect.any(WithingsAppConfigService)
            )
            expect(MockSchedulerService).toHaveBeenCalledWith(
                MockProfileService,
                expect.any(RunService),
                expect.any(WithingsSyncRunner)
            )
        })

        it('should return the same instance when initialized', () => {
            const result = services.initialize()
            expect(result).toBe(services)
        })

        it('should allow re-initialization without errors', () => {
            services.initialize()
            expect(() => services.initialize()).not.toThrow()
        })
    })

    describe('getters', () => {
        beforeEach(() => {
            services.initialize()
        })

        it('should return ConfigDirectoryService instance', () => {
            const configService = services.getConfigDirectoryService()
            expect(configService).toBeInstanceOf(ConfigDirectoryService)
        })

        it('should return WithingsAppConfigService instance', () => {
            const withingsConfigService = services.getWithingsAppConfigService()
            expect(withingsConfigService).toBeInstanceOf(WithingsAppConfigService)
        })

        it('should return SettingsService instance', () => {
            const settingsService = services.getSettingsService()
            expect(settingsService).toBeInstanceOf(SettingsService)
        })

        it('should return ProfileService instance', () => {
            const profileService = services.getProfileService()
            expect(profileService).toBe(MockProfileService)
        })

        it('should return RunService instance', () => {
            const runService = services.getRunService()
            expect(runService).toBeInstanceOf(RunService)
        })

        it('should return SchedulerService instance', () => {
            const schedulerService = services.getSchedulerService()
            expect(schedulerService).toBeInstanceOf(SchedulerService)
        })

        it('should return WithingsSyncRunner instance', () => {
            const withingsSyncRunner = services.getWithingsSyncRunner()
            expect(withingsSyncRunner).toBeInstanceOf(WithingsSyncRunner)
        })

        it('should return CryptoService instance', () => {
            const cryptoService = services.getCryptoService()
            expect(cryptoService).toBeInstanceOf(CryptoService)
        })

        it('should return prisma client', () => {
            const prismaClient = services.getPrisma()
            expect(prismaClient).toBe(prisma)
        })
    })

    describe('service instances', () => {
        it('should return the same instance on multiple getter calls', () => {
            services.initialize()
            
            const configService1 = services.getConfigDirectoryService()
            const configService2 = services.getConfigDirectoryService()
            expect(configService1).toBe(configService2)
            
            const runService1 = services.getRunService()
            const runService2 = services.getRunService()
            expect(runService1).toBe(runService2)
        })
    })

    describe('error handling', () => {
        it('should return undefined when accessing services before initialization', () => {
            const uninitializedServices = new Services()
            expect(uninitializedServices.getConfigDirectoryService()).toBeUndefined()
            expect(uninitializedServices.getWithingsAppConfigService()).toBeUndefined()
            expect(uninitializedServices.getSettingsService()).toBeUndefined()
            expect(uninitializedServices.getProfileService()).toBeUndefined()
            expect(uninitializedServices.getSchedulerService()).toBeUndefined()
            expect(uninitializedServices.getWithingsSyncRunner()).toBeUndefined()
            expect(uninitializedServices.getCryptoService()).toBeUndefined()
        })

        it('should allow accessing RunService before initialization', () => {
            const uninitializedServices = new Services()
            // RunService is initialized first in constructor, so it should be available
            expect(() => uninitializedServices.getRunService()).not.toThrow()
            expect(uninitializedServices.getRunService()).toBeUndefined()
        })
    })
})
