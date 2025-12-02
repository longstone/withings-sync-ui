import path from 'path'

export const projectRoot = path.resolve(__dirname, '..')
export const dataDir = path.join(projectRoot, 'data')
export const e2eDatabasePath = path.join(dataDir, 'db', 'e2e.db')
export const e2eDatabaseUrl = `file:${e2eDatabasePath}`
export const backendPort = Number(process.env.E2E_BACKEND_PORT ?? '31333')
export const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? '33333')
export const baseUrl = process.env.E2E_BASE_URL ?? `http://localhost:${frontendPort}`
