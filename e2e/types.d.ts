export {}

declare global {
  interface Window {
    __env?: {
      apiUrl: string
      wsUrl: string
    }
  }
}
