import {ChildProcess, spawn} from 'child_process'
import {RunService} from '@/services/RunService'
import {ProfileService} from '@/services/ProfileService'
import {WithingsAppConfigService} from '@/services/WithingsAppConfigService'
import {RunLogger} from '@/services/LoggerService'
import {CryptoService} from '@/services/CryptoService'
import prisma from '@/db/prisma'

export interface RunOptions {
  interactive: boolean
  timeout?: number // in milliseconds, default 5 minutes
  sessionId?: string // for WebSocket connection
  configDirOverride?: string // override config directory for onboarding
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

export interface RunResult {
  success: boolean
  exitCode: number | null
  errorMessage?: string
  output?: string
}

export type OutputCallback = (type: 'stdout' | 'stderr' | 'status' | 'error' | 'auth_url', data: string) => void

export class WithingsSyncRunner {
  private static readonly DEFAULT_TIMEOUT = 5 * 60 * 1000 // 5 minutes
  private runService: RunService
  private profileService: ProfileService
  private cryptoService: CryptoService
  private withingsAppConfigService: WithingsAppConfigService
  private runningProcesses: Map<string, ChildProcess> = new Map()

  constructor(
    runService: RunService,
    profileService: ProfileService,
    cryptoService: CryptoService,
    withingsAppConfigService: WithingsAppConfigService
  ) {
    this.runService = runService
    this.profileService = profileService
    this.cryptoService = cryptoService
    this.withingsAppConfigService = withingsAppConfigService
  }
  private static readonly INTERACTIVE_PROMPT_PATTERNS = [
    'User interaction needed to get Authentification Code from Withings!',
    'MFA code:',
    'Enter authentication code:',
    'Please enter the code:'
  ]

  private static readonly WITHINGS_AUTH_URL_PATTERNS = [
    /https:\/\/account\.withings\.com\/oauth2_user\/[^\s]+/g,
    /https:\/\/account\.withings\.com\/[^\s]*\/[^\s]+/g,
    /https:\/\/withings\.com\/[^\s]*\/oauth2[^\s]*/g
  ]

  // CLI argument constants
  private static readonly CLI_ARGS = {
    CONFIG_FOLDER: '--config-folder',
    DUMP_RAW: '--dump-raw',
    FEATURES: '--features',
    FROM_DATE: '--fromdate',
    GARMIN_PASSWORD: '--garmin-password',
    GARMIN_USERNAME: '--garmin-username',
    HELP: '--help',
    NO_UPLOAD: '--no-upload',
    OUTPUT: '--output',
    SILENT: '--silent',
    TO_DATE: '--todate',
    TO_FIT: '--to-fit',
    TO_JSON: '--to-json',
    TRAINERROAD_PASSWORD: '--trainerroad-password',
    TRAINERROAD_USERNAME: '--trainerroad-username',
    VERBOSE: '--verbose',
    VERSION: '--version',
  } as const

  // Run withings-sync CLI for a profile (scheduled/non-interactive mode)
  async runSync(profileId: string, runId: string, options: RunOptions = { interactive: false }): Promise<RunResult> {
    const runLogger = this.runService.createRunLogger(runId)
    const logFilePath = runLogger.getLogFilePath() // Get the log file path
    
    await this.runService.updateRun(runId, { logFilePath })
    
    try {
      const logLevel = options.logLevel || this.runService.getRunLogLevel(runId) || 'info'

      // Get profile details
      const profile = await this.profileService.getProfileById(profileId)
      if (!profile) {
        throw new Error(`Profile ${profileId} not found`)
      }

      // Ensure withings_app.json exists in config directory
      await this.withingsAppConfigService.syncToProfile(profileId)
      // Note: Main logger is not accessible here - runLogger is used for this run

      // Start the run in database
      await this.runService.startRun(runId)

      // Prepare CLI arguments
      const args = await this.buildCliArgs(profile, logLevel)
      
      // Prepare environment variables
      const env = {
        ...process.env,
        // Set config directory for this profile ( the override or the default)
        WITHINGS_CONFIG_DIR: options.configDirOverride || profile.withingsConfigDir
      }

      runLogger.info(`Starting withings-sync CLI for profile ${profileId}`)
      // Log command without exposing passwords
      const safeArgs = args.map((arg, index) => {
        if (index > 0
            && [WithingsSyncRunner.CLI_ARGS.GARMIN_PASSWORD, WithingsSyncRunner.CLI_ARGS.TRAINERROAD_PASSWORD].includes(args[index - 1] as typeof WithingsSyncRunner.CLI_ARGS.GARMIN_PASSWORD | typeof WithingsSyncRunner.CLI_ARGS.TRAINERROAD_PASSWORD)) {
          return '***MASKED***'
        }
        return arg
      })
      runLogger.info(`Command: withings-sync ${safeArgs.join(' ')}`)
      runLogger.info(`Interactive mode: ${options.interactive}`)

      // Execute the CLI process (non-interactive mode)
      const result = await this.executeCli(args, env, runLogger, options)

      // Complete the run in database
      if (result.success) {
        await this.runService.succeedRun(runId, result.exitCode || 0)
        runLogger.info('Run completed successfully')
      } else {
        await this.runService.failRun(runId, result.errorMessage || 'Unknown error', result.exitCode || undefined)
        runLogger.error(`Run failed: ${result.errorMessage}`)
      }

      return result

    } catch (error) {
      runLogger.error(`Run execution failed: ${error}`)
      
      // Mark run as failed in database
      try {
        await this.runService.failRun(runId, error instanceof Error ? error.message : 'Unknown error')
      } catch (dbError) {
        runLogger.error(`Failed to mark run as failed in database: ${dbError}`)
      }

      return {
        success: false,
        exitCode: null,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Start interactive run with real-time output streaming
  async startInteractiveRun(
      profileId: string,
      runId: string,
      outputCallback: OutputCallback,logLevel?: 'debug' | 'info' | 'warn' | 'error'): Promise<void> {
    const runLogger = this.runService.createRunLogger(runId)
    const logFilePath = runLogger.getLogFilePath()
    
    // Save the log file path to the database
    await this.runService.updateRun(runId, { logFilePath })
    
    try {
      const resolvedLogLevel = logLevel || this.runService.getRunLogLevel(runId) || 'info'

      // Get profile details
      const profile = await this.profileService.getProfileById(profileId)
      if (!profile) {
        throw new Error(`Profile ${profileId} not found`)
      }

      // Ensure withings_app.json exists in config directory
      await this.withingsAppConfigService.syncToProfile(profileId)

      // Start the run in database
      await this.runService.startRun(runId)

      // Prepare CLI arguments
      const args = await this.buildCliArgs(profile, resolvedLogLevel)
      
      // Prepare environment variables
      const env = {
        ...process.env,
        WITHINGS_CONFIG_DIR: profile.withingsConfigDir
      }

      runLogger.info(`Starting interactive withings-sync CLI for profile ${profileId}`)
      // Log command without exposing passwords
      const safeArgs = args.map((arg, index) => {
        if (index > 0 && [WithingsSyncRunner.CLI_ARGS.GARMIN_PASSWORD, WithingsSyncRunner.CLI_ARGS.TRAINERROAD_PASSWORD].includes(args[index - 1] as typeof WithingsSyncRunner.CLI_ARGS.GARMIN_PASSWORD | typeof WithingsSyncRunner.CLI_ARGS.TRAINERROAD_PASSWORD)) {
          return '***MASKED***'
        }
        return arg
      })
      runLogger.info(`Command: withings-sync ${safeArgs.join(' ')}`)

      // Wrap output callback to also write to runLogger
      const wrappedOutputCallback = (type: 'stdout' | 'stderr' | 'status' | 'error' | 'auth_url', data: string) => {
        // Write to runLogger for stdout/stderr
        if (type === 'stdout' || type === 'stderr') {
          runLogger.info(`${type.toUpperCase()}: ${data.trim()}`)
        }
        // Also send to original callback (WebSocket)
        outputCallback(type, data)
      }

      // Spawn the CLI process with wrapped output callback
      const childProcess = await this.spawnInteractiveProcess(args, env, runLogger, wrappedOutputCallback)

      // Store process reference for input sending and cleanup
      this.runningProcesses.set(runId, childProcess)

      // Handle process completion
      childProcess.on('close', async (code: number | null, signal: string | null) => {
        this.runningProcesses.delete(runId)
        runLogger.info(`Interactive process closed with code: ${code}, signal: ${signal}`)

        try {
          if (code === 0) {
            await this.runService.succeedRun(runId, code || 0)
            outputCallback('status', `completed with exit code ${code}`)
          } else {
            await this.runService.failRun(runId, `Process exited with code ${code}`, code || undefined)
            outputCallback('status', `failed with exit code ${code}`)
          }
        } catch (error) {
          runLogger.error(`Failed to update run status: ${error}`)
          outputCallback('error', `Failed to update run status: ${error}`)
        }
      })

      childProcess.on('error', async (error: Error) => {
        this.runningProcesses.delete(runId)
        runLogger.error(`Interactive process error: ${error.message}`)

        try {
          await this.runService.failRun(runId, `Process error: ${error.message}`)
          outputCallback('error', `Process error: ${error.message}`)
        } catch (dbError) {
          runLogger.error(`Failed to mark run as failed: ${dbError}`)
        }
      })

    } catch (error) {
      runLogger.error(`Interactive run start failed: ${error}`)
      
      try {
        await this.runService.failRun(runId, error instanceof Error ? error.message : 'Unknown error')
        outputCallback('error', error instanceof Error ? error.message : 'Unknown error')
      } catch (dbError) {
        runLogger.error(`Failed to mark run as failed: ${dbError}`)
      }
    }
  }

  // Send input to interactive process
  async sendInput(runId: string, sessionId: string, input: string): Promise<void> {
    const process = this.runningProcesses.get(runId)
    if (!process || !process.stdin) {
      // Note: Main logger not accessible in this context
      return
    }

    try {
      process.stdin.write(input + '\n')
      // Note: Main logger not accessible in this context
    } catch (error) {
      // Note: Main logger not accessible in this context
    }
  }

  // Detach from run (remove process tracking but don't kill immediately)
  async detachRun(runId: string): Promise<void> {
    const process = this.runningProcesses.get(runId)
    if (process) {
      // Note: Main logger not accessible in this context
      this.runningProcesses.delete(runId)
    }
  }

  // Kill a running process
  async killRun(runId: string): Promise<void> {
    const process = this.runningProcesses.get(runId)
    if (process) {
      // Note: Main logger not accessible in this context
      process.kill('SIGTERM')
      this.runningProcesses.delete(runId)
    }
  }

  // Build CLI arguments based on profile and mode
  private async buildCliArgs(profile: any, logLevel: 'debug' | 'info' | 'warn' | 'error'): Promise<string[]> {
    const args: string[] = []
    
    // Add config folder first
    args.push(WithingsSyncRunner.CLI_ARGS.CONFIG_FOLDER,  profile.withingsConfigDir)
    
    // Fetch Garmin credentials if account exists
    if (profile.garminAccountId) {
      const garminAccount = await prisma.serviceAccount.findUnique({
        where: { id: profile.garminAccountId }
      })
      if (garminAccount) {
        const decryptedPassword = this.cryptoService.decrypt(garminAccount.passwordEncrypted)
        args.push(WithingsSyncRunner.CLI_ARGS.GARMIN_USERNAME, garminAccount.username)
        args.push(WithingsSyncRunner.CLI_ARGS.GARMIN_PASSWORD, decryptedPassword)
        // Note: Main logger not accessible in this context
      }
    }
    
    // Fetch TrainerRoad credentials if account exists
    if (profile.trainerroadAccountId) {
      const trainerroadAccount = await prisma.serviceAccount.findUnique({
        where: { id: profile.trainerroadAccountId }
      })
      if (trainerroadAccount) {
        const decryptedPassword = this.cryptoService.decrypt(trainerroadAccount.passwordEncrypted)
        args.push(WithingsSyncRunner.CLI_ARGS.TRAINERROAD_USERNAME, trainerroadAccount.username)
        args.push(WithingsSyncRunner.CLI_ARGS.TRAINERROAD_PASSWORD, decryptedPassword)
        // Note: Main logger not accessible in this context
      }
    }

    // Add features if enabled
    if (profile.enableBloodPressure) {
      args.push(WithingsSyncRunner.CLI_ARGS.FEATURES, 'BLOOD_PRESSURE')
      // Note: Main logger not accessible in this context
    }

    // Adjust verbosity based on desired log level
    if (logLevel === 'debug') {
      args.push(WithingsSyncRunner.CLI_ARGS.VERBOSE)
    } else if (logLevel === 'warn' || logLevel === 'error') {
      args.push(WithingsSyncRunner.CLI_ARGS.SILENT)
    }

    return args
  }

  // Execute the CLI process with timeout and output capture (non-interactive)
  private async executeCli(
    args: string[], 
    env: NodeJS.ProcessEnv, 
    runLogger: RunLogger, 
    options: RunOptions
  ): Promise<RunResult> {
    return new Promise((resolve) => {
      const timeout = options.timeout || WithingsSyncRunner.DEFAULT_TIMEOUT
      let output = ''
      let hasInteractivePrompt = false

      // Spawn the withings-sync process
      const child: ChildProcess = spawn('withings-sync', args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        runLogger.error(`Process timed out after ${timeout}ms`)
        child.kill('SIGTERM')
        resolve({
          success: false,
          exitCode: null,
          errorMessage: `Process timed out after ${timeout}ms`
        })
      }, timeout)

      // Capture stdout
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const text = data.toString()
          output += text
          runLogger.logCliOutput(text, false)

          // Check for interactive prompts in non-interactive mode
          if (!options.interactive && this.detectInteractivePrompt(text)) {
            hasInteractivePrompt = true
            runLogger.error('Interactive prompt detected in non-interactive mode')
            child.kill('SIGTERM')
          }
        })
      }

      // Capture stderr
      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          const text = data.toString()
          output += text
          runLogger.logCliOutput(text, true)

          // Check for interactive prompts in non-interactive mode
          if (!options.interactive && this.detectInteractivePrompt(text)) {
            hasInteractivePrompt = true
            runLogger.error('Interactive prompt detected in non-interactive mode')
            child.kill('SIGTERM')
          }
        })
      }

      // Handle process completion
      child.on('close', (code: number | null, signal: string | null) => {
        clearTimeout(timeoutHandle)

        runLogger.info(`Process closed with code: ${code}, signal: ${signal}`)

        if (hasInteractivePrompt) {
          resolve({
            success: false,
            exitCode: code,
            errorMessage: 'withings-sync requires re/authentication: please run interactively',
            output
          })
        } else if (code === 0) {
          resolve({
            success: true,
            exitCode: code,
            output
          })
        } else {
          resolve({
            success: false,
            exitCode: code,
            errorMessage: `Process exited with code ${code}`,
            output
          })
        }
      })

      // Handle process errors
      child.on('error', (error: Error) => {
        clearTimeout(timeoutHandle)
        runLogger.error(`Process error: ${error.message}`)
        resolve({
          success: false,
          exitCode: null,
          errorMessage: `Process error: ${error.message}`,
          output
        })
      })
    })
  }

  // Spawn interactive process with real-time output
  private async spawnInteractiveProcess(
    args: string[], 
    env: NodeJS.ProcessEnv, 
    runLogger: RunLogger, 
    outputCallback: OutputCallback
  ): Promise<ChildProcess> {
    const child: ChildProcess = spawn('withings-sync', args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Set detached to false to ensure proper cleanup
      detached: false
    })

    // Send initial status
    outputCallback('status', 'Process started')

    // Track if we're waiting for input
    let isWaitingForInput = false

    // Forward stdout to callback
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString()
        runLogger.logCliOutput(text, false)
        
        // Check for Withings auth URLs in output
        const authUrls = this.extractWithingsAuthUrls(text)
        if (authUrls.length > 0) {
          // Emit auth URLs as special events
          authUrls.forEach(url => {
            outputCallback('auth_url', url)
          })
        } else {
          // Regular stdout output - ensure consistent line endings
        const normalizedText = text.replace(/\r?\n/g, '\r\n')
        outputCallback('stdout', normalizedText)
        }

        // Check for MFA or other interactive prompts
        if (this.detectInteractivePrompt(text)) {
          isWaitingForInput = true
          runLogger.info(`Interactive prompt detected in stdout: ${text.trim()}`)
          // Send a special status to indicate we're waiting for user input
          outputCallback('status', 'waiting_for_input')
        }
        
        // Check if we're no longer waiting for input
        if (isWaitingForInput && text.trim() && !this.detectInteractivePrompt(text)) {
          isWaitingForInput = false
        }
      })
    }

    // Forward stderr to callback
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        runLogger.logCliOutput(text, true)
        
        // Check for MFA or other interactive prompts
        if (this.detectInteractivePrompt(text)) {
          isWaitingForInput = true
          runLogger.info(`Interactive prompt detected in stderr: ${text.trim()}`)
          // Send a special status to indicate we're waiting for user input
          outputCallback('status', 'waiting_for_input')
        }
        
        // Ensure consistent line endings for stderr
        const normalizedText = text.replace(/\r?\n/g, '\r\n')
        outputCallback('stderr', normalizedText)
      })
    }

    // Handle stdin errors to prevent crashes
    if (child.stdin) {
      child.stdin.on('error', (error: Error) => {
        runLogger.error(`Stdin error: ${error.message}`)
        // Don't kill the process, just log the error
      })
    }

    return child
  }

  // Detect if CLI output contains interactive prompts
  private detectInteractivePrompt(output: string): boolean {
    const lowerOutput = output.toLowerCase()
    return WithingsSyncRunner.INTERACTIVE_PROMPT_PATTERNS.some(pattern => 
      lowerOutput.includes(pattern.toLowerCase())
    )
  }

  // Extract Withings auth URLs from CLI output
  private extractWithingsAuthUrls(output: string): string[] {
    const urls: string[] = []
    
    for (const pattern of WithingsSyncRunner.WITHINGS_AUTH_URL_PATTERNS) {
      const matches = output.match(pattern)
      if (matches) {
        urls.push(...matches)
      }
    }
    
    // Remove duplicates and return
    return [...new Set(urls)]
  }

  // Check if withings-sync CLI is available
  async checkCliAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('withings-sync', [WithingsSyncRunner.CLI_ARGS.VERSION], { stdio: 'ignore' })
      
      child.on('close', (code) => {
        resolve(code === 0)
      })
      
      child.on('error', () => {
        resolve(false)
      })
    })
  }

  // Get CLI version
  async getCliVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const child = spawn('withings-sync', [WithingsSyncRunner.CLI_ARGS.VERSION], { stdio: 'pipe' })
      let output = ''
      
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          output += data.toString()
        })
      }
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim())
        } else {
          resolve(null)
        }
      })
      
      child.on('error', () => {
        resolve(null)
      })
    })
  }
}
