import {existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync} from 'fs'
import {join} from 'path'
import {Dirent} from "node:fs";


export class LogDirectoryService {
    private readonly logDir: string

    constructor( private dataDir: string) {
        this.logDir = join(this.dataDir, 'logs')
    }

    provideLogDirectory() {
        if (!this.isLogDirectoryExisting()) {
            mkdirSync(this.logDir, {recursive: true})
        }
    }

    provideProfileDirectory(profileId: string): string {
        const profileDir: string = join(this.logDir, profileId)
        if (!existsSync(profileDir)) {
            mkdirSync(profileDir, {recursive: true})
        }
        return profileDir;
    }

    /**
     * returns config directory path. be sure to use the provide method first.
     */
    getLogDirectory() {
        return this.logDir;
    }

    isLogDirectoryExisting() {
        return existsSync(this.getLogDirectory())
    }

    getConfigDirectoryContents(): Dirent[] {
        return readdirSync(this.logDir, {withFileTypes: true})
    }

    getConfigDirectoryFolders(): string [] {
        if (!this.isLogDirectoryExisting()) {
            return []
        }

        return this.getConfigDirectoryContents()
            .filter((entry: Dirent<string>) => this.isNoTempDirectory(entry))
            .map((entry: Dirent<string>) => join(this.logDir, entry.name));

    }

    private isNoTempDirectory(entry: Dirent<string>) {
        return entry.isDirectory() && !entry.name.startsWith('temp-');
    }

    readRunLogs(profileId: string, runId: string): string[] {
        try {
            const profileDir = this.provideProfileDirectory(profileId);
            const logFile = join(profileDir, `${runId}.log`);

            if (!existsSync(logFile)) {
                return [];
            }

            const content = readFileSync(logFile, 'utf8');
            const lines = content.split('\n').filter((line: string) => line.trim().length > 0);

            // Parse JSON log entries and return just the message content
            return lines.map((line: string) => {
                try {
                    const parsed = JSON.parse(line);
                    return `[${parsed.timestamp}] ${parsed.level}: ${parsed.message}`;
                } catch {
                    return line; // Return raw line if parsing fails
                }
            });
        } catch (error) {
            console.error(`Failed to read run logs for ${runId}:`, error);
            return [];
        }
    }

    /**
     * Delete a specific log file for a run
     * @param logFilePath - Full path to the log file to delete
     * @returns true if file was deleted, false if it didn't exist
     */
    deleteLogFile(logFilePath: string): boolean {
        if (existsSync(logFilePath)) {
            try {
                unlinkSync(logFilePath)
                return true
            } catch (error) {
                console.error(`Failed to delete log file ${logFilePath}:`, error)
                throw error
            }
        }
        return false
    }
}
