declare global {
  interface Window {
    __env?: {
      apiUrl?: string
      wsUrl?: string
    }
  }
}

const runtimeEnv = typeof window !== 'undefined' ? window.__env : undefined

export const environment = {
  production: false,
  apiUrl: runtimeEnv?.apiUrl ?? 'http://localhost:3333/api',
  wsUrl: runtimeEnv?.wsUrl ?? 'ws://localhost:3333'
}
