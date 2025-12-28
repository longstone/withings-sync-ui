import {ConfigDirectoryService} from '@/services/ConfigDirectoryService'
import {join} from 'path'
import {Dirent} from 'node:fs'

// Mock fs module
jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs')
    return {
        ...actualFs,
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        readdirSync: jest.fn()
    }
})

const mockFs = jest.mocked(require('fs'))

describe('ConfigDirectoryService', () => {
    let service: ConfigDirectoryService
    const originalEnv = process.env

    beforeEach(() => {
        jest.resetModules()
        jest.clearAllMocks()
        service = new ConfigDirectoryService()
    })

    afterEach(() => {
        process.env = originalEnv
    })

    describe('constructor', () => {
        it('should use default data directory when DATA_DIR is not set', () => {
            delete process.env.DATA_DIR
            const newService = new ConfigDirectoryService()
            expect(newService['dataDir']).toBe('/app/data/')
            expect(newService['configDir']).toBe('/app/data/withings-config')
        })

        it('should use custom data directory when DATA_DIR is set', () => {
            process.env.DATA_DIR = '/custom/data'
            const newService = new ConfigDirectoryService()
            expect(newService['dataDir']).toBe('/custom/data')
            expect(newService['configDir']).toBe('/custom/data/withings-config')
        })

        it('should log the config directory path', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
            new ConfigDirectoryService()
            expect(consoleSpy).toHaveBeenCalledWith(
                'Config Directory being used:',
                expect.stringContaining('withings-config')
            )
            consoleSpy.mockRestore()
        })
    })

    describe('provideConfigDirectory', () => {
        it('should create config directory if it does not exist', () => {
            mockFs.existsSync.mockReturnValue(false)
            service.provideConfigDirectory()
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('withings-config'),
                { recursive: true }
            )
        })

        it('should not create config directory if it already exists', () => {
            mockFs.existsSync.mockReturnValue(true)
            service.provideConfigDirectory()
            expect(mockFs.mkdirSync).not.toHaveBeenCalled()
        })
    })

    describe('provideProfileDirectory', () => {
        const profileId = 'test-profile-123'

        it('should create profile directory if it does not exist', () => {
            mockFs.existsSync.mockReturnValue(false)
            const result = service.provideProfileDirectory(profileId)
            
            const expectedPath = join(service['configDir'], profileId)
            expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath)
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true })
            expect(result).toBe(expectedPath)
        })

        it('should not create profile directory if it already exists', () => {
            mockFs.existsSync.mockReturnValue(true)
            const result = service.provideProfileDirectory(profileId)
            
            const expectedPath = join(service['configDir'], profileId)
            expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath)
            expect(mockFs.mkdirSync).not.toHaveBeenCalled()
            expect(result).toBe(expectedPath)
        })
    })

    describe('getConfigDirectory', () => {
        it('should return the config directory path', () => {
            const configDir = service.getConfigDirectory()
            expect(configDir).toBe(service['configDir'])
            expect(configDir).toContain('withings-config')
        })
    })

    describe('isConfigDirectoryExisting', () => {
        it('should return true when config directory exists', () => {
            mockFs.existsSync.mockReturnValue(true)
            const exists = service.isConfigDirectoryExisting()
            expect(exists).toBe(true)
            expect(mockFs.existsSync).toHaveBeenCalledWith(service['configDir'])
        })

        it('should return false when config directory does not exist', () => {
            mockFs.existsSync.mockReturnValue(false)
            const exists = service.isConfigDirectoryExisting()
            expect(exists).toBe(false)
            expect(mockFs.existsSync).toHaveBeenCalledWith(service['configDir'])
        })
    })

    describe('getConfigDirectoryContents', () => {
        it('should return directory contents', () => {
            const mockEntries: Dirent[] = [
                { name: 'profile1', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'profile2', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'config.json', isDirectory: () => false, isFile: () => true } as Dirent
            ]
            mockFs.readdirSync.mockReturnValue(mockEntries)
            
            const contents = service.getConfigDirectoryContents()
            expect(contents).toEqual(mockEntries)
            expect(mockFs.readdirSync).toHaveBeenCalledWith(service['configDir'], { withFileTypes: true })
        })
    })

    describe('getConfigDirectoryFolders', () => {
        it('should return empty array when config directory does not exist', () => {
            mockFs.existsSync.mockReturnValue(false)
            const folders = service.getConfigDirectoryFolders()
            expect(folders).toEqual([])
            expect(mockFs.readdirSync).not.toHaveBeenCalled()
        })

        it('should return only non-temp directories', () => {
            const mockEntries: Dirent[] = [
                { name: 'profile1', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'temp-profile2', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'profile3', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'temp-backup', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'config.json', isDirectory: () => false, isFile: () => true } as Dirent
            ]
            
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(mockEntries)
            
            const folders = service.getConfigDirectoryFolders()
            
            expect(folders).toHaveLength(2)
            expect(folders).toContain(join(service['configDir'], 'profile1'))
            expect(folders).toContain(join(service['configDir'], 'profile3'))
            expect(folders).not.toContain(join(service['configDir'], 'temp-profile2'))
            expect(folders).not.toContain(join(service['configDir'], 'temp-backup'))
            expect(folders).not.toContain(join(service['configDir'], 'config.json'))
        })

        it('should return all directories when no temp directories exist', () => {
            const mockEntries: Dirent[] = [
                { name: 'profile1', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'profile2', isDirectory: () => true, isFile: () => false } as Dirent,
                { name: 'profile3', isDirectory: () => true, isFile: () => false } as Dirent
            ]
            
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(mockEntries)
            
            const folders = service.getConfigDirectoryFolders()
            
            expect(folders).toHaveLength(3)
            expect(folders).toContain(join(service['configDir'], 'profile1'))
            expect(folders).toContain(join(service['configDir'], 'profile2'))
            expect(folders).toContain(join(service['configDir'], 'profile3'))
        })

        it('should return empty array when only files exist', () => {
            const mockEntries: Dirent[] = [
                { name: 'config1.json', isDirectory: () => false, isFile: () => true } as Dirent,
                { name: 'config2.json', isDirectory: () => false, isFile: () => true } as Dirent
            ]
            
            mockFs.existsSync.mockReturnValue(true)
            mockFs.readdirSync.mockReturnValue(mockEntries)
            
            const folders = service.getConfigDirectoryFolders()
            expect(folders).toEqual([])
        })
    })

    describe('private method isNoTempDirectory', () => {
        it('should return true for non-temp directories', () => {
            const entry = { name: 'profile1', isDirectory: () => true, isFile: () => false } as Dirent
            const result = service['isNoTempDirectory'](entry)
            expect(result).toBe(true)
        })

        it('should return false for temp directories', () => {
            const entry = { name: 'temp-profile', isDirectory: () => true, isFile: () => false } as Dirent
            const result = service['isNoTempDirectory'](entry)
            expect(result).toBe(false)
        })

        it('should return false for files', () => {
            const entry = { name: 'config.json', isDirectory: () => false, isFile: () => true } as Dirent
            const result = service['isNoTempDirectory'](entry)
            expect(result).toBe(false)
        })
    })
})
