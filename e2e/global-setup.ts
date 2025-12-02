import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { e2eDatabasePath, e2eDatabaseUrl, projectRoot } from './test-environment'

async function globalSetup() {
  const dbDir = path.dirname(e2eDatabasePath)

  fs.mkdirSync(dbDir, { recursive: true })

  if (fs.existsSync(e2eDatabasePath)) {
    fs.rmSync(e2eDatabasePath)
  }

  console.log(`[e2e] Preparing test database at ${e2eDatabaseUrl}`)

  execSync('npx prisma db push --config backend/prisma.config.ts', {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl
    },
    stdio: 'inherit'
  })
}

export default globalSetup
