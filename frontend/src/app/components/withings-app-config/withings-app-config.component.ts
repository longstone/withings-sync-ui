import { Component, OnInit, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ApiService } from '../../services/api.service'

export interface WithingsAppConfig {
  callback_url: string
  client_id: string
  consumer_secret: string
}

@Component({
  selector: 'app-withings-app-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="withings-app-config">
      <h2>Withings Application Configuration</h2>
      <p class="description">
        Configure your own Withings application for OAuth authentication. 
        This allows you to use your own client credentials instead of the default ones.
      </p>

      <div class="config-form">
        <div class="form-group">
          <label for="callback_url">Callback URL</label>
          <input 
            type="text" 
            id="callback_url" 
            [(ngModel)]="config.callback_url" 
            placeholder="https://your-domain.com/withings.html"
            class="form-control"
          />
          <small class="form-text">
            This URL must match exactly what you configured in your Withings developer app.
            It should point to the withings.html file hosted on this server.
          </small>
        </div>

        <div class="form-group">
          <label for="client_id">Client ID</label>
          <input 
            type="text" 
            id="client_id" 
            [(ngModel)]="config.client_id" 
            placeholder="Your Withings app Client ID"
            class="form-control"
          />
          <small class="form-text">
            The Client ID from your Withings developer application.
          </small>
        </div>

        <div class="form-group">
          <label for="consumer_secret">Consumer Secret</label>
          <input 
            type="password" 
            id="consumer_secret" 
            [(ngModel)]="config.consumer_secret" 
            placeholder="Your Withings app Consumer Secret"
            class="form-control"
          />
          <small class="form-text">
            The Consumer Secret from your Withings developer application.
            Keep this secure and never share it publicly.
          </small>
        </div>

        <div class="form-actions">
          <button 
            (click)="saveConfig()" 
            [disabled]="saving"
            class="btn btn-primary"
          >
            @if (saving) {
              <span class="spinner"></span>
              Saving...
            } @else {
              Save Configuration
            }
          </button>
          
          <button 
            (click)="resetToDefault()" 
            [disabled]="saving"
            class="btn btn-secondary"
          >
            Use Default App
          </button>
        </div>
      </div>

      @if (message()) {
        <div class="alert" [class]="message()!.type">
          {{ message()!.text }}
        </div>
      }

      <div class="info-section">
        <h3>How to Register Your Own Withings Application</h3>
        <ol>
          <li>
            <strong>Create a Withings Account:</strong>
            If you don't have one, sign up at 
            <a href="https://account.withings.com/connectionuser/account_create" target="_blank" rel="noopener">
              Withings Account Creation
            </a>
          </li>
          <li>
            <strong>Register a Developer App:</strong>
            Create your application at 
            <a href="https://account.withings.com/partner/add_oauth2" target="_blank" rel="noopener">
              Withings Developer Portal
            </a>
          </li>
          <li>
            <strong>Configure Callback URL:</strong>
            Use the callback URL shown above. Make sure it matches exactly in your Withings app configuration.
          </li>
          <li>
            <strong>Get Credentials:</strong>
            After registration, you'll receive a Client ID and Consumer Secret.
          </li>
          <li>
            <strong>Upload App Icon:</strong>
            You'll need to upload an app icon during registration (any square image will work).
          </li>
        </ol>

        <div class="callback-info">
          <h4>Your Current Callback URL:</h4>
          <div class="callback-url-display">
            <code>{{ currentCallbackUrl() }}</code>
            <button (click)="copyCallbackUrl()" class="btn btn-sm btn-outline">Copy</button>
          </div>
          <p class="note">
            Use this URL when registering your Withings application. 
            The withings.html file will handle the OAuth callback.
          </p>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./withings-app-config.component.scss']
})
export class WithingsAppConfigComponent implements OnInit {
  config: WithingsAppConfig = {
    callback_url: '',
    client_id: '',
    consumer_secret: ''
  }

  saving = false
  message = signal<{ type: 'success' | 'error' | 'warning', text: string } | null>(null)
  currentCallbackUrl = signal('')

  constructor(private apiService: ApiService) {}

  async ngOnInit() {
    // Calculate the callback URL based on current location
    const baseUrl = window.location.origin
    this.currentCallbackUrl.set(`${baseUrl}/withings.html`)
    this.config.callback_url = this.currentCallbackUrl()

    // Load existing configuration
    try {
      const response = await this.apiService.get('/settings/withings-app') as any
      if (response && response.config) {
        this.config = { ...response.config }
      }
    } catch (error) {
      console.warn('No custom Withings app configuration found')
    }
  }

  async saveConfig() {
    if (!this.config.client_id || !this.config.consumer_secret) {
      this.message.set({ type: 'error', text: 'Client ID and Consumer Secret are required' })
      return
    }

    this.saving = true
    this.message.set(null)

    try {
      await this.apiService.post('/settings/withings-app', { config: this.config })
      this.message.set({ type: 'success', text: 'Withings app configuration saved successfully!' })
    } catch (error: any) {
      this.message.set({ 
        type: 'error', 
        text: error.error?.message || 'Failed to save configuration' 
      })
    } finally {
      this.saving = false
    }
  }

  async resetToDefault() {
    this.saving = true
    this.message.set(null)

    try {
      await this.apiService.delete('/settings/withings-app')
      this.config = {
        callback_url: this.currentCallbackUrl(),
        client_id: '',
        consumer_secret: ''
      }
      this.message.set({ type: 'success', text: 'Reset to default Withings app configuration' })
    } catch (error: any) {
      this.message.set({ 
        type: 'error', 
        text: error.error?.message || 'Failed to reset configuration' 
      })
    } finally {
      this.saving = false
    }
  }

  copyCallbackUrl() {
    navigator.clipboard.writeText(this.currentCallbackUrl()).then(() => {
      this.message.set({ type: 'success', text: 'Callback URL copied to clipboard!' })
      setTimeout(() => this.message.set(null), 3000)
    }).catch(() => {
      this.message.set({ type: 'error', text: 'Failed to copy URL' })
    })
  }
}
