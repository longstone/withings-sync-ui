import {Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, ViewEncapsulation, NgZone} from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebSocketService } from '../../services/websocket.service'
import { RunService } from '../../services/run.service'
import { WebSocketMessage, RunStatus } from '../../models/run.model'
import { SettingsService } from '../../services/settings.service'
import { ProfileService } from '../../services/profile.service'
import { SyncProfile } from '../../models/profile.model'
import {tap} from 'rxjs/operators';

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './terminal.component.html',
  styleUrl: './terminal.component.scss'
})
export class TerminalComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('terminalContainer') terminalContainer!: ElementRef

  private terminal: Terminal | null = null
  private fitAddon: FitAddon | null = null
  protected sessionId: string | null = null
  private inputBuffer: string = ''
  private httpError: string | null = null

  isConnecting = false
  isConnected = false
  isRunning = false
  authUrls: string[] = []
  error: string | null = null
  runStatus: RunStatus | null = null

  profileId: string | null = null
  isProfileLocked = false
  availableProfiles: SyncProfile[] = [] // For profile selection

  constructor(
    private webSocketService: WebSocketService,
    private runService: RunService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private settingsService: SettingsService,
    private profileService: ProfileService,
  ) {}

  ngOnInit(): void {
    // Load available profiles
    this.loadProfiles()
    
    // Get profileId from route parameters or query params
    this.route.paramMap.subscribe(params => {
      const id = params.get('profileId')
      if (id) {
        this.profileId = id
        this.isProfileLocked = true
      }
    })

    this.route.queryParamMap.subscribe(params => {
      const id = params.get('profileId')

      if (id && !this.profileId) {
        this.profileId = id
        this.isProfileLocked = true
      }
    })
  }

  ngAfterViewInit(): void {
    this.initializeTerminal()
  }

  ngOnDestroy(): void {
    this.disconnect()
    if (this.terminal) {
      this.terminal.dispose()
    }
  }

  private initializeTerminal(): void {
    if (!this.terminalContainer) return

    // Run terminal initialization outside NgZone to prevent interference
    this.ngZone.runOutsideAngular(() => {
      this.terminal = new Terminal({
        cols: 80,
        rows: 24,
        scrollback: 1000,
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'Courier New, monospace'
      })

      this.fitAddon = new FitAddon()
      this.terminal.loadAddon(this.fitAddon)

      this.terminal.open(this.terminalContainer.nativeElement)
      this.fitAddon.fit()

      // Debug: Check if terminal is properly opened
      console.log('Terminal opened:', {
        hasElement: !!this.terminal.element,
        containerExists: !!this.terminalContainer.nativeElement,
        terminalCols: this.terminal.cols,
        terminalRows: this.terminal.rows
      })

      // Write a test message to verify terminal is working
      this.terminal.write('\x1b[32mTerminal initialized. Ready for input...\x1b[0m\r\n')

      // Force a reflow and check visibility
      setTimeout(() => {
        const terminalEl = this.terminal!.element
        if (terminalEl) {
          console.log('Terminal element details:', {
            exists: !!terminalEl,
            visible: terminalEl.offsetParent !== null,
            dimensions: {
              offsetWidth: terminalEl.offsetWidth,
              offsetHeight: terminalEl.offsetHeight,
              clientWidth: terminalEl.clientWidth,
              clientHeight: terminalEl.clientHeight
            },
            canvas: terminalEl.querySelector('canvas')?.getContext('2d') ? 'canvas exists' : 'no canvas'
          })

          // Force focus and reflow
          this.terminal!.focus()
          this.fitAddon!.fit()

          // Trigger change detection and refresh
          this.cdr.detectChanges()

        }
      }, 100)

      // Handle terminal input
      this.terminal.onData((data: string) => {
      console.log('Terminal data received:', data.charCodeAt(0), data)

      if (!this.isConnected || !this.isRunning) {
        console.log('Ignoring input - not connected or running', { isConnected: this.isConnected, isRunning: this.isRunning })
        return
      }

      if (data === '\r') {
        // Enter key - send the buffered input
        console.log('Enter pressed, sending:', this.inputBuffer)
        if (this.inputBuffer.trim()) {
          this.webSocketService.sendInput(this.sessionId!, this.inputBuffer)
          this.terminal?.write('\r\n')
        }
        this.inputBuffer = ''
      } else if (data === '\u007f') {
        // Backspace
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1)
          this.terminal?.write('\b \b')
        }
      } else if (data >= ' ') {
        // Regular character
        console.log('Adding character to buffer:', data)
        this.inputBuffer += data
        this.terminal?.write(data)
      }
    })

    // Handle window resize
    window.addEventListener('resize', () => {
      this.fitAddon?.fit()
    })

    this.terminal.write('Terminal ready. Connect to start a session.\r\n')
    }) // Close ngZone.runOutsideAngular
  }

  startInteractiveRun(): void {
    if (!this.profileId) {
      this.error = 'Please select a profile first'
      return
    }
    this.connect(this.profileId)
  }

  
  selectProfile(profileId: string | null): void {
    if (this.isProfileLocked) {
      return
    }
    if (!profileId) {
      this.profileId = null
      this.router.navigate(['/terminal'])
      return
    }

    this.profileId = profileId
    this.router.navigate(['/terminal'], { queryParams: { profileId } })
  }

  private connect(profileId: string): void {
    // For regular interactive runs, we need to start the run first
    this.isConnecting = true
    this.httpError = null
    // Don't set error immediately - wait for WebSocket connection to fail
    this.terminal?.write('\r\nConnecting to session...\r\n');

    const logLevel = this.settingsService.settings.logLevel
    this.runService.startInteractiveRun(profileId, logLevel).subscribe({
      next: (response) => {
        this.sessionId = response.sessionId
        this.connectWebSocket()
      },
      error: (err) => {
        // Store the HTTP error but don't display it yet
        this.httpError = err.message || 'Failed to start interactive run'
        this.connectWebSocket()
      }
    })
  }

  private connectWebSocket(): void {
    if (!this.sessionId) {
      // If we don't have a sessionId, the HTTP request failed
      // Use the stored HTTP error message
      this.error = this.httpError || 'withings-sync CLI is not available on this server'
      this.isConnecting = false
      this.terminal?.write(`\r\n\x1b[31m=== ERROR: ${this.error} ===\x1b[0m\r\n`)
      return
    }

    this.isConnecting = true
    this.error = null

    this.webSocketService.connect(this.sessionId).subscribe({
      next: (message) => {
        this.handleWebSocketMessage(message)
      },
      error: (err) => {
        this.error = `WebSocket connection failed: ${err.message}`
        this.isConnecting = false
      },
      complete: () => {
        this.isConnected = false
        this.isRunning = false
        this.isConnecting = false
      }
    })
  }

  // Filter out ANSI escape codes that might clear the terminal
  private filterAnsiEscapeCodes(data: string): string {
    // Remove specific escape sequences that clear screen or reset terminal
    // \x1b[2J = Clear screen
    // \x1b[H = Cursor home
    // \x1c = File separator (can cause issues)
    // \x1b[?25l = Hide cursor
    // \x1b[?25h = Show cursor
    return data
      .replace(/\x1b\[2J/g, '')
      .replace(/\x1b\[H/g, '')
      .replace(/\x1c/g, '')
      .replace(/\x1b\[\?25l/g, '')
      .replace(/\x1b\[\?25h/g, '')
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    this.isConnecting = false

    // Debug logging
    console.log('WebSocket message received:', message.type, message.data?.substring(0, 50))

    switch (message.type) {
      case 'status':
        if (message.data === 'connected') {
          this.isConnected = true
          this.isRunning = true
          this.terminal?.write('\r\n=== Connected to session ===\r\n')
        } else if (message.data?.includes('completed')) {
          this.isRunning = false
          this.runStatus = RunStatus.SUCCESS
          this.terminal?.write(`\r\n=== ${message.data} ===\r\n`)
        } else if (message.data?.includes('failed')) {
          this.isRunning = false
          this.runStatus = RunStatus.FAILED
          this.terminal?.write(`\r\n=== ${message.data} ===\r\n`)
        } else if (message.data === 'waiting_for_input') {
          // Explicitly ensure we stay in running state when waiting for input
          this.isRunning = true
          this.isConnected = true
          console.log('Waiting for input - ensuring terminal is focused')
          // Ensure terminal focus for input
          this.terminal?.focus()
        }
        break

      case 'stdout':
        try {
          if (!this.terminal) {
            console.error('Terminal instance is null!')
            return
          }

          // Check for ANSI escape codes that might clear the terminal
          const data = message.data || ''
          if (data.includes('\x1b[')) {
            console.warn('ANSI escape codes detected in stdout:', data)
            console.log('Escape codes:', data.match(/\x1b\[[0-9;]*[A-Za-z]/g))
          }

          console.log('Writing to terminal:', data.substring(0, 50))
          console.log('Raw data:', Array.from(data).map(c => c.charCodeAt(0)))

          // Filter out potentially problematic ANSI codes
          const filteredData = this.filterAnsiEscapeCodes(data)
          if (filteredData !== data) {
            console.log('Filtered ANSI escape codes')
          }

          // Ensure terminal is properly sized before writing
          if (this.fitAddon) {
            // Use setTimeout to ensure container is rendered
            setTimeout(() => {
              this.fitAddon!.fit()
              // Debug: log terminal dimensions
              const terminalElement = this.terminal!.element
              if (terminalElement) {
                console.log('Terminal dimensions:', {
                  width: terminalElement.clientWidth,
                  height: terminalElement.clientHeight,
                  cols: this.terminal!.cols,
                  rows: this.terminal!.rows
                })

                // Check canvas
                const canvas = terminalElement.querySelector('canvas')
                if (canvas) {
                  const ctx = canvas.getContext('2d')
                  console.log('Canvas context:', ctx ? 'available' : 'null')

                  // Force a refresh
                  this.terminal!.refresh(0, this.terminal!.rows - 1)
                }
              }
            }, 0)
          }

          // Ensure proper line endings in the data
          const dataWithLineEndings = filteredData.replace(/\r?\n/g, '\r\n')
          this.terminal.write(dataWithLineEndings)

          // Force refresh after write
          setTimeout(() => {
            this.terminal!.refresh(0, this.terminal!.rows)
          }, 10)
        } catch (error) {
          console.error('Error writing to terminal:', error)
        }
        break

      case 'stderr':
        try {
          if (!this.terminal) {
            console.error('Terminal instance is null!')
            return
          }
          console.log('Writing stderr to terminal:', message.data?.substring(0, 50))
          // Write stderr in red color with proper line endings
          const stderrData = (message.data || '').replace(/\r?\n/g, '\r\n')
          this.terminal.write(`\x1b[31m${stderrData}\x1b[0m`)
        } catch (error) {
          console.error('Error writing stderr to terminal:', error)
        }
        break

      case 'auth_url':
        if (message.data) {
          this.authUrls.push(message.data)
          this.terminal?.write(`\r\n\x1b[34m=== Authentication URL: ${message.data} ===\x1b[0m\r\n`)
        }
        break

      case 'error':
        this.error = message.data || 'Unknown error'
        this.terminal?.write(`\r\n\x1b[31m=== ERROR: ${message.data} ===\x1b[0m\r\n`)
        this.isRunning = false
        this.runStatus = RunStatus.FAILED
        break

      case 'close':
        this.isConnected = false
        this.isRunning = false
        this.terminal?.write(`\r\n=== Connection closed: ${message.data} ===\r\n`)
        break
    }
  }

  
  cancelRun(): void {
    if (!this.sessionId) {
      this.error = 'No active run to cancel'
      return
    }

    // Call the run service to cancel the run
    this.runService.cancelRun(this.sessionId).subscribe({
      next: () => {
        this.terminal?.write('\r\n\x1b[33m=== Run cancelled by user ===\x1b[0m\r\n')
        this.isRunning = false
        this.runStatus = RunStatus.FAILED
        // Disconnect after cancelling
        this.disconnect()
      },
      error: (err) => {
        this.error = `Failed to cancel run: ${err.message}`
        this.terminal?.write(`\r\n\x1b[31m=== Failed to cancel run: ${err.message} ===\x1b[0m\r\n`)
      }
    })
  }

  disconnect(): void {
    if (this.sessionId) {
      this.webSocketService.disconnect(this.sessionId)
      this.sessionId = null
    }
    this.isConnected = false
    this.isRunning = false
    this.isConnecting = false
  }

  clearTerminal(): void {
    console.log('Clear terminal called')
    if (this.terminal) {
      this.terminal.clear()
      this.authUrls = []
      this.error = null
    }
  }

  copyAuthUrl(url: string): void {
    navigator.clipboard.writeText(url).then(() => {
      // Could show a toast notification here
    })
  }

  dismissAuthUrl(url: string): void {
    const index = this.authUrls.indexOf(url)
    if (index > -1) {
      this.authUrls.splice(index, 1)
    }
  }

  private loadProfiles(): void {
    this.profileService.getProfiles().subscribe({
      next: (profiles) => {
        this.availableProfiles = profiles

        if (this.isProfileLocked && this.profileId) {
          const exists = profiles.some(p => p.id === this.profileId)
          if (!exists) {
            this.error = 'Selected profile is not available. Please choose a profile.'
            this.isProfileLocked = false
            this.profileId = null
            this.router.navigate(['/terminal'])
          }
        }
      },
      error: (err) => {
        console.error('Failed to load profiles:', err)
        this.error = 'Failed to load profiles'
      }
    })
  }
}
