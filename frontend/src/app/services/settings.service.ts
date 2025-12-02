import {Injectable, signal} from '@angular/core';
import {ApiService} from './api.service';
import {firstValueFrom} from 'rxjs';

export interface AppSettings {
  // System settings
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  withingsCallbackUrl?: string;
  withingsClientId?: string;
  withingsConsumerSecret?: string;
  withingsCustomApp: boolean;

  // UI preferences
  apiTimeout: number;
  timeFormat: '12h' | '24h';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD.MM.YYYY';

  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly defaultSettings: AppSettings = {
    logLevel: 'info',
    apiTimeout: 30,
    timeFormat: '24h',
    dateFormat: 'DD/MM/YYYY',
    withingsCustomApp: false
  };

  private _settings = signal<AppSettings>(this.defaultSettings);
  private _loading = signal<boolean>(false);
  private _initialized = false;

  constructor(private apiService: ApiService) {
    this.loadSettings();
  }

  get settingsSignal() {
    return this._settings.asReadonly();
  }

  get settings() {
    return this._settings();
  }

  get loading() {
    return this._loading();
  }

  get loadingSignal() {
    return this._loading.asReadonly();
  }

  async loadSettings(): Promise<void> {
    if (this._initialized) return;

    this._loading.set(true);
    try {
      const settings = await firstValueFrom(this.apiService.get<AppSettings>('/settings'));
      this._settings.set({...this.defaultSettings, ...settings});
      this._initialized = true;
    } catch (error) {
      console.error('Failed to load settings from server, using defaults:', error);
      // Keep default settings if server is unavailable
      this._initialized = true;
    } finally {
      this._loading.set(false);
    }
  }

  async updateSettings(newSettings: Partial<AppSettings>): Promise<void> {
    this._loading.set(true);
    try {
      const updated = await firstValueFrom(this.apiService.put<AppSettings>('/settings', newSettings));
      this._settings.set(updated);
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    } finally {
      this._loading.set(false);
    }
  }

  async removeWithingsConfig(): Promise<void> {
    this._loading.set(true);
    try {
      const updated = await firstValueFrom(this.apiService.delete<AppSettings>('/settings/withings'));
      this._settings.set(updated);
    } catch (error) {
      console.error('Failed to remove Withings config:', error);
      throw error;
    } finally {
      this._loading.set(false);
    }
  }

  async saveWithingsAppConfig(config: {
    callback_url: string;
    client_id: string;
    consumer_secret: string
  }): Promise<void> {
    this._loading.set(true);
    try {
      await firstValueFrom(this.apiService.post('/settings/withings-app', {config}));
      // Update local settings to reflect the saved config
      this._settings.update(current => ({
        ...current,
        withingsCallbackUrl: config.callback_url,
        withingsClientId: config.client_id,
        withingsCustomApp: true
      }));
    } catch (error) {
      console.error('Failed to save Withings config:', error);
      throw error;
    } finally {
      this._loading.set(false);
    }
  }

  resetSettings(): void {
    // Only reset UI preferences, keep system settings
    const current = this._settings();
    const reset: AppSettings = {
      ...this.defaultSettings,
      logLevel: current.logLevel,
      withingsCallbackUrl: current.withingsCallbackUrl,
      withingsClientId: current.withingsClientId,
      withingsConsumerSecret: current.withingsConsumerSecret
    };
    this.updateSettings(reset);
  }
}
