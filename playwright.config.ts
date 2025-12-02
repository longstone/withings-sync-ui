import { defineConfig } from '@playwright/test'
import path from 'path'
import { baseUrl, backendPort, dataDir, e2eDatabaseUrl, frontendPort, projectRoot } from './e2e/test-environment'

const frontendCommand = `bash -c "npm run frontend:build && cd dist/frontend/browser && python3 -m http.server ${frontendPort} --bind 0.0.0.0"`
const backendCommand = `bash -c "npx prisma db push --config prisma.config.ts && npm run backend:build && PORT=${backendPort} HOST=0.0.0.0 DATA_DIR=${dataDir} DATABASE_URL=${e2eDatabaseUrl} npm run backend:start"`

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: baseUrl,
    trace: 'on-first-retry'
  },
  webServer: [
          {
            command: backendCommand,
            url: `http://localhost:${backendPort}/health`,
            reuseExistingServer: false,
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 120000,
            cwd: path.join(projectRoot, 'backend'),
            env: {
              ...process.env,
              DATABASE_URL: e2eDatabaseUrl,
              DATA_DIR: dataDir,
              PORT: String(backendPort),
              HOST: '0.0.0.0'
            }
          }
        ,
    {
      command: frontendCommand,
      url: baseUrl,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 180000,
      cwd: path.join(projectRoot, 'frontend')
    }
  ],
  globalSetup: require.resolve('./e2e/global-setup')
})
