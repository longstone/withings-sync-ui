import {execSync} from 'child_process'
import {existsSync, unlinkSync} from 'fs'
import {join} from 'path'
import {PrismaClient} from "../db/prisma-client-generated/client";
import {PrismaBetterSqlite3} from "@prisma/adapter-better-sqlite3";

export class TestDatabase {
    private static instance: TestDatabase
    private prisma: PrismaClient
    private testDbPath: string

    private constructor() {
        this.testDbPath = join(process.cwd(), 'data', 'test.db')
        const adapter = new PrismaBetterSqlite3(
            {url: `file:${this.testDbPath}`}
        );
        this.prisma = new PrismaClient({adapter})

    }

    public static getInstance(): TestDatabase {
        if (!TestDatabase.instance) {
            TestDatabase.instance = new TestDatabase()
        }
        return TestDatabase.instance
    }

    public async setup(): Promise<void> {
        // Remove existing test database
        if (existsSync(this.testDbPath)) {
            unlinkSync(this.testDbPath)
        }

        // Ensure data directory exists
        const dataDir = join(process.cwd(), 'data')
        if (!existsSync(dataDir)) {
            execSync(`mkdir -p ${dataDir}`)
        }

        // Run database migrations
        process.env.DATABASE_URL = `file:${this.testDbPath}`
        execSync('npx prisma migrate deploy', {
            cwd: process.cwd(),
            env: {...process.env, DATABASE_URL: `file:${this.testDbPath}`}
        })

        // Connect to the test database
        await this.prisma.$connect()
    }

    public async teardown(): Promise<void> {
        await this.prisma.$disconnect()

        // Remove test database
        if (existsSync(this.testDbPath)) {
            unlinkSync(this.testDbPath)
        }
    }

    public async reset(): Promise<void> {
        // Delete all data from all tables
        const tablenames = await this.prisma.$queryRaw`SELECT name
                                                       FROM sqlite_master
                                                       WHERE type = 'table'
                                                         AND name NOT LIKE 'sqlite_%'
                                                         AND name NOT LIKE '_prisma_migrations';`

        for (const {name} of tablenames as { name: string }[]) {
            await this.prisma.$executeRawUnsafe(`DELETE
                                                 FROM "${name}";`)
        }
    }

    public getClient(): PrismaClient {
        return this.prisma
    }

    // Helper methods to create test data
    public async createTestUser(data?: Partial<{ displayName: string }>) {
        return this.prisma.user.create({
            data: {
                displayName: data?.displayName || 'Test User'
            }
        })
    }

    public async createTestServiceAccount(userId: string, type: string, data?: Partial<{
        username: string;
        passwordEncrypted: string
    }>) {
        return this.prisma.serviceAccount.create({
            data: {
                type,
                username: data?.username || 'test-user',
                passwordEncrypted: data?.passwordEncrypted || 'encrypted-password',
                ownerUserId: userId
            }
        })
    }

    public async createTestSyncProfile(userId: string, data?: Partial<{
        name: string;
        withingsConfigDir: string;
        enabled: boolean
    }>) {
        return this.prisma.syncProfile.create({
            data: {
                name: data?.name || 'Test Profile',
                withingsConfigDir: data?.withingsConfigDir || '/tmp/withings-test',
                enabled: data?.enabled ?? true,
                ownerUserId: userId
            }
        })
    }

    public async createTestSyncRun(profileId: string, data?: Partial<{
        mode: string;
        status: string;
        exitCode: number
    }>) {
        return this.prisma.syncRun.create({
            data: {
                syncProfileId: profileId,
                mode: data?.mode || 'MANUAL',
                status: data?.status || 'PENDING',
                exitCode: data?.exitCode
            }
        })
    }
}

// Export singleton instance
export const testDatabase = TestDatabase.getInstance()
