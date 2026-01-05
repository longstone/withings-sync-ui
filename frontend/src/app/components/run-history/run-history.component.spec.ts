import {ComponentFixture, TestBed} from '@angular/core/testing'
import {ActivatedRoute} from '@angular/router'
import {BehaviorSubject, of} from 'rxjs'
import {vi} from 'vitest'
import {RunHistoryComponent} from './run-history.component'
import {RunService} from '../../services/run.service'
import {ProfileService} from '../../services/profile.service'
import {SettingsService} from '../../services/settings.service'
import {RunMode, RunStatus, SyncRun} from '../../models/run.model'
import {SyncProfile} from '../../models/profile.model'

describe('RunHistoryComponent', () => {
  let component: RunHistoryComponent
  let fixture: ComponentFixture<RunHistoryComponent>
  let mockRunService: any
  let mockProfileService: any
  let mockSettingsService: SettingsService
  let paramMapSubject: BehaviorSubject<any>

  const mockProfile: SyncProfile = {
    id: 'profile1',
    name: 'Test Profile',
    ownerUserId: 'user1',
    withingsConfigDir: '/config',
    garminAccountId: null,
    trainerroadAccountId: null,
    enabled: true,
    enableBloodPressure: false,
    scheduleCron: '0 0 * * *',
    createdAt: '2026-01-05T10:00:00Z',
    updatedAt: '2026-01-05T10:00:00Z'
  }

  const mockRuns: SyncRun[] = [
    {
      id: 'run1',
      syncProfileId: 'profile1',
      mode: RunMode.CRON,
      status: RunStatus.SUCCESS,
      startedAt: '2026-01-05T16:56:00Z',
      finishedAt: '2026-01-05T16:56:04Z',
      exitCode: 0,
      logFilePath: '/logs/run1.log',
      errorMessage: null
    },
    {
      id: 'run2',
      syncProfileId: 'profile1',
      mode: RunMode.MANUAL,
      status: RunStatus.SUCCESS,
      startedAt: '2026-01-05T16:34:00Z',
      finishedAt: '2026-01-05T16:34:24Z',
      exitCode: 0,
      logFilePath: '/logs/run2.log',
      errorMessage: null
    }
  ]

  beforeEach(async () => {
    paramMapSubject = new BehaviorSubject({
      get: (key: string) => key === 'profileId' ? 'profile1' : null
    })

    mockRunService = {
      getRunsByProfileId: vi.fn().mockReturnValue(of(mockRuns)),
      getRunLog: vi.fn().mockReturnValue(of('Log content'))
    }

    mockProfileService = {
      getProfileById: vi.fn().mockReturnValue(of(mockProfile))
    }

    mockSettingsService = {
      settings: {
        logLevel: 'info',
        apiTimeout: 30,
        timeFormat: '24h',
        dateFormat: 'DD/MM/YYYY',
        withingsCustomApp: false
      }
    } as SettingsService

    await TestBed.configureTestingModule({
      imports: [RunHistoryComponent],
      providers: [
        { provide: RunService, useValue: mockRunService },
        { provide: ProfileService, useValue: mockProfileService },
        { provide: SettingsService, useValue: mockSettingsService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMapSubject.asObservable()
          }
        }
      ]
    }).compileComponents()

    fixture = TestBed.createComponent(RunHistoryComponent)
    component = fixture.componentInstance
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })

  it('should load profile and runs on init', async () => {
    fixture.detectChanges()
    await fixture.whenStable()

    expect(mockProfileService.getProfileById).toHaveBeenCalledWith('profile1')
    expect(mockRunService.getRunsByProfileId).toHaveBeenCalledWith('profile1')
    expect(component.profile).toEqual(mockProfile)
    expect(component.runs).toEqual(mockRuns)
  })

  it('should reload data when route parameter changes', async () => {
    fixture.detectChanges()
    await fixture.whenStable()

    expect(mockProfileService.getProfileById).toHaveBeenCalledTimes(1)
    expect(mockRunService.getRunsByProfileId).toHaveBeenCalledTimes(1)

    const mockProfile2: SyncProfile = {
      ...mockProfile,
      id: 'profile2',
      name: 'Test Profile 2'
    }

    const mockRuns2: SyncRun[] = [
      {
        ...mockRuns[0],
        id: 'run3',
        syncProfileId: 'profile2'
      }
    ]

    mockProfileService.getProfileById.mockReturnValue(of(mockProfile2))
    mockRunService.getRunsByProfileId.mockReturnValue(of(mockRuns2))

    paramMapSubject.next({
      get: (key: string) => key === 'profileId' ? 'profile2' : null
    })

    await fixture.whenStable()

    expect(mockProfileService.getProfileById).toHaveBeenCalledWith('profile2')
    expect(mockRunService.getRunsByProfileId).toHaveBeenCalledWith('profile2')
    expect(component.profile).toEqual(mockProfile2)
    expect(component.runs).toEqual(mockRuns2)
  })

  it('should reset selected run and log content when switching profiles', async () => {
    fixture.detectChanges()
    await fixture.whenStable()

    component.selectedRun = mockRuns[0]
    component.logContent = 'Previous log content'

    const mockProfile2: SyncProfile = {
      ...mockProfile,
      id: 'profile2',
      name: 'Test Profile 2'
    }

    mockProfileService.getProfileById.mockReturnValue(of(mockProfile2))
    mockRunService.getRunsByProfileId.mockReturnValue(of([]))

    paramMapSubject.next({
      get: (key: string) => key === 'profileId' ? 'profile2' : null
    })

    await fixture.whenStable()

    expect(component.selectedRun).toBeNull()
    expect(component.logContent).toBe('')
  })

  it('should load run log when run is clicked', async () => {
    fixture.detectChanges()
    await fixture.whenStable()

    component.onRunClick(mockRuns[0])

    expect(component.selectedRun).toEqual(mockRuns[0])
    expect(mockRunService.getRunLog).toHaveBeenCalledWith('run1')
  })

  it('should format duration correctly', () => {
    const run: SyncRun = {
      ...mockRuns[0],
      startedAt: '2026-01-05T16:00:00Z',
      finishedAt: '2026-01-05T16:00:04Z'
    }

    expect(component.formatDuration(run)).toBe('4s')
  })

  it('should return N/A for duration when finishedAt is null', () => {
    const run: SyncRun = {
      ...mockRuns[0],
      finishedAt: null
    }

    expect(component.formatDuration(run)).toBe('N/A')
  })


  it('should return correct status class', () => {
    expect(component.getStatusClass('SUCCESS')).toBe('success')
    expect(component.getStatusClass('FAILED')).toBe('failed')
    expect(component.getStatusClass('RUNNING')).toBe('running')
    expect(component.getStatusClass('PENDING')).toBe('pending')
  })

  it('should return correct mode class', () => {
    expect(component.getModeClass('MANUAL')).toBe('manual')
    expect(component.getModeClass('CRON')).toBe('cron')
  })
})
