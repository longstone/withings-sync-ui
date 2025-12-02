declare global {
  interface Window {
    __env?: {
      apiUrl?: string
      wsUrl?: string
    }
  }
}

const runtimeEnv = typeof window !== 'undefined' ? window.__env : undefined
const defaultWs = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

export const environment = {
  production: true,
  apiUrl: runtimeEnv?.apiUrl ?? '/api',
  wsUrl: runtimeEnv?.wsUrl ?? defaultWs
}
