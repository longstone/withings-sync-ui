import {ChangeDetectorRef, Component, DestroyRef, OnInit} from '@angular/core'
import {ActivatedRoute} from '@angular/router'
import {CommonModule} from '@angular/common'
import {finalize} from 'rxjs/operators'
import {takeUntilDestroyed} from '@angular/core/rxjs-interop'
import {RunService} from '../../services/run.service'
import {ProfileService} from '../../services/profile.service'
import {SyncRun} from '../../models/run.model'
import {SyncProfile} from '../../models/profile.model'
import {CustomDatePipe} from '../../pipes/custom-date.pipe'

@Component({
  selector: 'app-run-history',
  standalone: true,
  imports: [CommonModule, CustomDatePipe],
  templateUrl: './run-history.component.html',
  styleUrl: './run-history.component.scss'
})
export class RunHistoryComponent implements OnInit {
  profile: SyncProfile | null = null
  runs: SyncRun[] = []
  loading = false
  error: string | null = null
  selectedRun: SyncRun | null = null
  logContent: string = ''
  logLoading = false

  constructor(
    private route: ActivatedRoute,
    private runService: RunService,
    private profileService: ProfileService,
    private cdr: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const profileId = params.get('profileId')
      if (profileId) {
        this.selectedRun = null
        this.logContent = ''
        this.loadProfile(profileId)
        this.loadRuns(profileId)
      }
    })
  }

  loadProfile(profileId: string): void {
    this.profileService.getProfileById(profileId).subscribe({
      next: (profile) => {
        this.profile = profile
        this.cdr.detectChanges()
      },
      error: (err) => {
        this.error = err.message
        this.cdr.detectChanges()
      }
    })
  }

  loadRuns(profileId: string): void {
    this.loading = true
    this.error = null

    this.runService.getRunsByProfileId(profileId)
      .pipe(finalize(() => {
        this.loading = false
        this.cdr.detectChanges()
      }))
      .subscribe({
        next: (runs) => {
          this.runs = runs
        },
        error: (err) => {
          this.error = err.message
        }
      })
  }

  onRunClick(run: SyncRun): void {
    this.selectedRun = run
    this.loadRunLog(run.id)
  }

  loadRunLog(runId: string): void {
    this.logLoading = true
    this.logContent = ''

    this.runService.getRunLog(runId)
      .pipe(finalize(() => {
        this.logLoading = false
        this.cdr.detectChanges()
      }))
      .subscribe({
        next: (log) => {
          this.logContent = log
        },
        error: (err) => {
          this.logContent = `Error loading log: ${err.message}`
        }
      })
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'SUCCESS':
        return 'success'
      case 'FAILED':
        return 'failed'
      case 'RUNNING':
        return 'running'
      case 'PENDING':
        return 'pending'
      default:
        return ''
    }
  }

  getModeClass(mode: string): string {
    return mode === 'MANUAL' ? 'manual' : 'cron'
  }

  formatDuration(run: SyncRun): string {
    if (!run.finishedAt) return 'N/A'

    const start = new Date(run.startedAt)
    const end = new Date(run.finishedAt)
    const duration = end.getTime() - start.getTime()

    if (duration < 1000) return `${duration}ms`
    if (duration < 60000) return `${Math.round(duration / 1000)}s`
    return `${Math.round(duration / 60000)}m`
  }

  copyLogToClipboard(): void {
    if (!this.logContent) return

    // Create a header with run information
    const header = `Run Log - ${this.selectedRun?.startedAt}\n` +
                  `Profile: ${this.profile?.name}\n` +
                  `Mode: ${this.selectedRun?.mode}\n` +
                  `Status: ${this.selectedRun?.status}\n` +
                  `Exit Code: ${this.selectedRun?.exitCode || 'N/A'}\n` +
                  `${'='.repeat(50)}\n\n`

    const fullLog = header + this.logContent

    navigator.clipboard.writeText(fullLog).then(
      () => {
        // Could add a toast notification here
        console.log('Log copied to clipboard')
      },
      (err) => {
        console.error('Failed to copy log:', err)
      }
    )
  }

}
