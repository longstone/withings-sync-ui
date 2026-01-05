import {ComponentFixture, TestBed} from '@angular/core/testing'
import {vi} from 'vitest'
import {SettingsService} from '../../services/settings.service'
import {Config} from './config'

describe('Config', () => {
  let component: Config
  let fixture: ComponentFixture<Config>
  let mockSettingsService: SettingsService

  beforeEach(async () => {
    mockSettingsService = {
      settings: {
        logLevel: 'info',
        apiTimeout: 30,
        timeFormat: '24h',
        dateFormat: 'DD/MM/YYYY',
        withingsCustomApp: false
      },
      updateSettings: vi.fn(),
      resetSettings: vi.fn()
    } as unknown as SettingsService

    await TestBed.configureTestingModule({
      imports: [Config],
      providers: [{provide: SettingsService, useValue: mockSettingsService}]
    })
    .compileComponents()

    fixture = TestBed.createComponent(Config)
    component = fixture.componentInstance
    await fixture.whenStable()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
