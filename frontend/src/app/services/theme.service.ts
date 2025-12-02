import { Injectable, effect, signal } from '@angular/core'

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'withings-theme'

  theme = signal<'light' | 'dark'>('light')

  constructor() {
    // Initialize theme from localStorage or system preference
    const stored = localStorage.getItem(this.STORAGE_KEY) as 'light' | 'dark' | null
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches

    this.theme.set(stored ?? (prefersDark ? 'dark' : 'light'))

    // Apply theme changes to DOM
    effect(() => {
      const mode = this.theme()
      document.documentElement.setAttribute('data-theme', mode)
      document.body.setAttribute('data-theme', mode)
      localStorage.setItem(this.STORAGE_KEY, mode)
    })
  }

  toggle() {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light')
  }
}
