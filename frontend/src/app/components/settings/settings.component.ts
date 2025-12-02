import { Component, OnInit, OnDestroy, effect, ViewChild } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms'
import { SettingsService, AppSettings } from '../../services/settings.service'
import { WithingsInstructionsModalComponent } from '../withings-instructions-modal/withings-instructions-modal.component'

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WithingsInstructionsModalComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit, OnDestroy {
  settingsForm!: FormGroup
  loading = false
  saving = false
  error: string | null = null
  success: string | null = null
  
  @ViewChild(WithingsInstructionsModalComponent) 
  withingsModal!: WithingsInstructionsModalComponent

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService
  ) {
    // Use effect to react to signal changes
    effect(() => {
      this.loading = this.settingsService.loadingSignal()
    })

    effect(() => {
      const settings = this.settingsService.settingsSignal()
      if (settings && this.settingsForm) {
        this.settingsForm.patchValue({
          logLevel: settings.logLevel,
          withingsCallbackUrl: settings.withingsCallbackUrl || '',
          withingsClientId: settings.withingsClientId || '',
          withingsConsumerSecret: settings.withingsConsumerSecret || '',
          withingsCustomApp: settings.withingsCustomApp,
          apiTimeout: settings.apiTimeout,
          timeFormat: settings.timeFormat,
          dateFormat: settings.dateFormat
        })
      }
    })
  }

  ngOnInit(): void {
    this.initializeForm()
    this.loadSettings()
  }

  ngOnDestroy(): void {
    // No subscriptions to cleanup with signals
  }

  private initializeForm(): void {
    this.settingsForm = this.fb.group({
      // System settings
      logLevel: ['info', Validators.required],
      withingsCallbackUrl: [''],
      withingsClientId: [''],
      withingsConsumerSecret: [''],
      withingsCustomApp: [false],
      
      // UI preferences
      apiTimeout: [30, [Validators.required, Validators.min(5), Validators.max(300)]],
      timeFormat: ['24h', Validators.required],
      dateFormat: ['DD/MM/YYYY', Validators.required]
    })
  }

  private loadSettings(): void {
    // Settings are automatically loaded via the service constructor
    // and updates are handled by effects in the constructor
    this.settingsService.loadSettings()
  }

  async saveSettings(): Promise<void> {
    if (this.settingsForm.invalid) {
      this.markFormGroupTouched(this.settingsForm)
      return
    }

    this.saving = true
    this.error = null
    this.success = null

    try {
      const formValue = this.settingsForm.value
      
      // Save non-Withings settings normally
      const updateData: Partial<AppSettings> = {
        logLevel: formValue.logLevel,
        apiTimeout: formValue.apiTimeout,
        timeFormat: formValue.timeFormat,
        dateFormat: formValue.dateFormat
      }

      await this.settingsService.updateSettings(updateData)

      // Handle Withings configuration separately
      const hasWithingsClientId = formValue.withingsClientId?.trim()
      const hasWithingsSecret = formValue.withingsConsumerSecret?.trim()
      
      if (hasWithingsClientId && hasWithingsSecret && formValue.withingsCustomApp) {
        // Save Withings config to file
        await this.settingsService.saveWithingsAppConfig({
          callback_url: formValue.withingsCallbackUrl?.trim() || `${window.location.origin}/withings.html`,
          client_id: formValue.withingsClientId.trim(),
          consumer_secret: formValue.withingsConsumerSecret.trim()
        })
      } else if ((hasWithingsClientId || hasWithingsSecret) && formValue.withingsCustomApp) {
        this.error = 'Both Client ID and Consumer Secret must be provided or removed together'
        this.saving = false
        return
      } else if (!formValue.withingsCustomApp) {
        // Remove Withings config if disabled
        await this.settingsService.removeWithingsConfig()
      }

      this.success = 'Settings saved successfully'
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        this.success = null
      }, 3000)
    } catch (err: any) {
      this.error = err.message || 'Failed to save settings'
    } finally {
      this.saving = false
    }
  }

  async removeWithingsConfig(): Promise<void> {
    if (!confirm('Are you sure you want to remove the Withings app configuration? This will delete the configuration files from all profiles.')) {
      return
    }

    this.saving = true
    this.error = null
    this.success = null

    try {
      await this.settingsService.removeWithingsConfig()
      this.settingsForm.patchValue({
        withingsCallbackUrl: '',
        withingsClientId: '',
        withingsConsumerSecret: '',
        withingsCustomApp: false
      })
      this.success = 'Withings configuration removed successfully'
      
      setTimeout(() => {
        this.success = null
      }, 3000)
    } catch (err: any) {
      this.error = err.message || 'Failed to remove Withings configuration'
    } finally {
      this.saving = false
    }
  }

  resetUiPreferences(): void {
    if (!confirm('Reset all UI preferences to default values? System settings will remain unchanged.')) {
      return
    }

    this.settingsService.resetSettings()
    this.success = 'UI preferences reset to defaults'
    
    setTimeout(() => {
      this.success = null
    }, 3000)
  }

  // Helper to mark all controls as touched
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched()
    })
  }

  openWithingsInstructions(): void {
    this.withingsModal.open()
  }

  // Getters for easy access in template
  get logLevel() { return this.settingsForm.get('logLevel') }
  get withingsCallbackUrl() { return this.settingsForm.get('withingsCallbackUrl') }
  get withingsClientId() { return this.settingsForm.get('withingsClientId') }
  get withingsConsumerSecret() { return this.settingsForm.get('withingsConsumerSecret') }
  get apiTimeout() { return this.settingsForm.get('apiTimeout') }
  get timeFormat() { return this.settingsForm.get('timeFormat') }
  get dateFormat() { return this.settingsForm.get('dateFormat') }
}
