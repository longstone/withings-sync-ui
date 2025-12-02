import {PrismaClient} from './prisma-client-generated/client'
import {PrismaBetterSqlite3} from '@prisma/adapter-better-sqlite3';

const defaultDatabaseUrl = 'file:../data/db/app.db'
const url: string = process.env.DATABASE_URL || defaultDatabaseUrl

const adapter = new PrismaBetterSqlite3(
    {url}
);
const prisma = new PrismaClient({adapter})

// Handle graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect()
})

export default prisma
