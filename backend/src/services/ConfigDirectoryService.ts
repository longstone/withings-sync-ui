import {existsSync, mkdirSync, readdirSync} from 'fs'
import {join} from 'path'
import {Dirent} from "node:fs";
import {LoggerService} from '@/services/LoggerService'


export class ConfigDirectoryService {
    private readonly configDir: string

    constructor(private logger: LoggerService, private dataDir:string) {
        this.configDir = join(this.dataDir, 'withings-config')
        this.logger.info('Config Directory being used: ' + this.configDir)
    }

    provideConfigDirectory() {
        if (!this.isConfigDirectoryExisting()) {
            mkdirSync(this.configDir, {recursive: true})
        }
    }

    provideProfileDirectory(profileId: string): string {
        const profileDir: string = join(this.configDir, profileId)
        if (!existsSync(profileDir)) {
            mkdirSync(profileDir, {recursive: true})
        }
        return profileDir;
    }

    /**
     * returns config directory path. be sure to use the provide method first.
     */
    getConfigDirectory() {
        return this.configDir;
    }

    isConfigDirectoryExisting() {
        return existsSync(this.getConfigDirectory())
    }

    getConfigDirectoryContents(): Dirent[] {
        return readdirSync(this.configDir, {withFileTypes: true})
    }

    getConfigDirectoryFolders(): string [] {
        if (!this.isConfigDirectoryExisting()) {
            return []
        }

        return this.getConfigDirectoryContents()
            .filter((entry: Dirent<string>) => this.isNoTempDirectory(entry))
            .map((entry: Dirent<string>) => join(this.configDir, entry.name));

    }

    private isNoTempDirectory(entry: Dirent<string>) {
        return entry.isDirectory() && !entry.name.startsWith('temp-');
    }
}
