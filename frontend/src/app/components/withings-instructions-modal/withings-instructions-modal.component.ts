import {Component} from '@angular/core'
import {CommonModule} from '@angular/common'
import {signal} from '@angular/core'

@Component({
  selector: 'app-withings-instructions-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay" (click)="close()">
        <div class="modal-container" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Register Your Own Withings Application</h2>
            <button class="close-btn" (click)="close()" aria-label="Close modal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="modal-content">
            <p class="subtitle">
              Follow these steps to register your custom Withings application and use it with withings-sync.
            </p>

            <!-- Callback URL Section -->
            <div class="callback-section">
              <h3>1. Your Callback URL</h3>
              <div class="callback-url-box">
                <label for="callbackUrl">Use this URL when registering your Withings app:</label>
                <div class="url-display">
                  <input
                    type="text"
                    id="callbackUrl"
                    [value]="callbackUrl()"
                    readonly
                    class="url-input"
                  />
                  <button (click)="copyCallbackUrl()" class="copy-btn">
                    @if (copied()) {
                      Copied!
                    } @else {
                      Copy
                    }
                  </button>
                </div>
                <p class="note">
                  This URL points to the withings.html file that will handle the OAuth callback.
                </p>
              </div>
            </div>

            <!-- Registration Steps -->
            <div class="steps-section">
              <h3>2. Registration Steps</h3>
              <ol class="steps-list">
                <li>
                  <strong>Create a Withings Account</strong>
                  <p>If you don't have one, sign up at
                    <a href="https://account.withings.com/connectionuser/account_create" target="_blank" rel="noopener">
                      https://account.withings.com/connectionuser/account_create
                    </a>
                  </p>
                </li>

                <li>
                  <strong>Register a Developer Application</strong>
                  <p>Go to the Withings Developer Portal and create a new OAuth2 application:
                    <a href="https://account.withings.com/partner/add_oauth2" target="_blank" rel="noopener">
                      https://account.withings.com/partner/add_oauth2
                    </a>
                  </p>
                  <p class="warning">
                    Note: You'll need to provide an app icon (any square image will work).
                  </p>
                </li>

                <li>
                  <strong>Configure Your Application</strong>
                  <ul>
                    <li>Set the <strong>Callback URL</strong> to the URL shown above</li>
                    <li>Choose any application name and description</li>
                    <li>Upload an app icon (required)</li>
                  </ul>
                </li>

                <li>
                  <strong>Get Your Credentials</strong>
                  <p>After registration, you'll receive:
                    <br><strong>Client ID</strong> - A long string starting with numbers
                    <br><strong>Consumer Secret</strong> - Another long string
                  </p>
                </li>
              </ol>
            </div>

            <!-- Next Steps -->
            <div class="next-steps">
              <h3>3. Configure withings-sync</h3>
              <div class="config-box">
                <p>Once you have your Client ID and Consumer Secret, you need to create a <code>withings_app.json</code>
                  file in your profile directory:</p>

                <pre class="code-block"><code>{{ getConfigTemplate() }}</code></pre>

                <p class="instruction">
                  Replace <strong>YOUR_CLIENT_ID_HERE</strong> and <strong>YOUR_CONSUMER_SECRET_HERE</strong>
                  with the actual values from your Withings developer app.
                </p>

                <p class="location-note">
                  <strong>File Location:</strong> The <code>withings_app.json</code> file should be placed in:
                  <br><code>/data/withings-config/[your-profile-id]/withings_app.json</code>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./withings-instructions-modal.component.scss']
})
export class WithingsInstructionsModalComponent {
  isOpen = signal(false)
  callbackUrl = signal('')
  copied = signal(false)

  constructor() {
    // Calculate the callback URL based on current location
    const baseUrl = window.location.origin
    this.callbackUrl.set(`${baseUrl}/withings.html`)
  }

  open(): void {
    this.isOpen.set(true)
    document.body.style.overflow = 'hidden'
  }

  close(): void {
    this.isOpen.set(false)
    document.body.style.overflow = ''
  }

  getConfigTemplate(): string {
    return `{
  "callback_url": "${this.callbackUrl()}",
  "client_id": "YOUR_CLIENT_ID_HERE",
  "consumer_secret": "YOUR_CONSUMER_SECRET_HERE"
}`
  }

  copyCallbackUrl(): void {
    navigator.clipboard.writeText(this.callbackUrl()).then(() => {
      this.copied.set(true)
      setTimeout(() => this.copied.set(false), 2000)
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = this.callbackUrl()
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      try {
        document.execCommand('copy')
        this.copied.set(true)
        setTimeout(() => this.copied.set(false), 2000)
      } catch (err) {
        console.error('Failed to copy URL:', err)
      }

      document.body.removeChild(textArea)
    })
  }
}
