import {ChangeDetectorRef, Component, OnInit} from '@angular/core'
import {ActivatedRoute, Router} from '@angular/router'
import {CommonModule} from '@angular/common'
import {FormsModule} from '@angular/forms'
import {ProfileService} from '../../services/profile.service'
import {CredentialInputComponent} from '../credential-input/credential-input.component'
import {SyncProfile, CreateProfileData, UpdateProfileData} from '../../models/profile.model'
import {finalize} from 'rxjs/operators';

@Component({
  selector: 'app-profile-form',
  standalone: true,
  imports: [CommonModule, FormsModule, CredentialInputComponent],
  templateUrl: './profile-form.component.html',
  styleUrl: './profile-form.component.scss'
})
export class ProfileFormComponent implements OnInit {
  profile: SyncProfile | null = null
  isEdit = false
  loading = false
  saving = false
  error: string | null = null

  formData: CreateProfileData | UpdateProfileData = {
    name: '',
    ownerUserId: 'default-user', // Default user ID - would come from auth
    garminUsername: '',
    garminPassword: '',
    trainerroadUsername: '',
    trainerroadPassword: '',
    enabled: true,
    enableBloodPressure: false,
    scheduleCron: ''
  }
  scheduleEnabled = false
  garminEnabled = false
  trainerroadEnabled = false

  constructor(
    public route: ActivatedRoute,
    private router: Router,
    private profileService: ProfileService,
    private cdr: ChangeDetectorRef,
  ) {
  }

  ngOnInit(): void {
    const profileId = this.route.snapshot.paramMap.get('id')

    if (profileId && profileId !== 'new') {
      this.isEdit = true
      this.loadProfile(profileId)
    }
  }

  loadProfile(id: string): void {
    this.loading = true
    this.error = null

    this.profileService.getProfileById(id)
      .pipe(finalize(() => {
      this.loading = false;
      this.cdr.detectChanges()
    })).subscribe({
      next: (profile) => {
        console.log('Loaded profile data:', {
          garminUsername: profile.garminUsername,
          garminPassword: profile.garminPassword ? '[hidden]' : null,
          garminAccountId: profile.garminAccountId,
          trainerroadUsername: profile.trainerroadUsername,
          trainerroadPassword: profile.trainerroadPassword ? '[hidden]' : null,
          trainerroadAccountId: profile.trainerroadAccountId
        })
        
        this.profile = profile
        this.scheduleEnabled = !!profile.scheduleCron
        this.garminEnabled = !!(profile.garminUsername || profile.garminPassword || profile.garminAccountId)
        this.trainerroadEnabled = !!(profile.trainerroadUsername || profile.trainerroadPassword || profile.trainerroadAccountId)
        this.formData = {
          name: profile.name,
          ownerUserId: profile.ownerUserId,
          garminUsername: profile.garminUsername || '',
          garminPassword: profile.garminPassword || '',
          trainerroadUsername: profile.trainerroadUsername || '',
          trainerroadPassword: profile.trainerroadPassword || '',
          enabled: profile.enabled,
          enableBloodPressure: profile.enableBloodPressure,
          scheduleCron: profile.scheduleCron || ''
        }
        this.loading = false
        // Force change detection to ensure checkboxes are updated
        setTimeout(() => {
          this.cdr.detectChanges()
        })
      },
      error: (err) => {
        this.error = err.message
        this.loading = false
      }
    })
  }

  onSubmit(): void {
    if (!this.formData.name?.trim()) {
      this.error = 'Profile name is required'
      return
    }

    // Debug: Log the form data being sent
    console.log('Submitting form data:', {
      ...this.formData,
      garminUsername: this.formData.garminUsername || '[empty]',
      garminPassword: this.formData.garminPassword ? '[***masked***]' : '[empty]'
    })

    this.saving = true
    this.error = null

    if (this.isEdit && this.profile) {
      this.profileService.updateProfile(this.profile.id, this.formData).subscribe({
        next: () => {
          this.router.navigate(['/profiles'])
        },
        error: (err) => {
          this.error = err.message
          this.saving = false
        }
      })
    } else {
      this.profileService.createProfile(this.formData as CreateProfileData).subscribe({
        next: () => {
          this.router.navigate(['/profiles'])
        },
        error: (err) => {
          this.error = err.message
          this.saving = false
        }
      })
    }
  }

  onCancel(): void {
    this.router.navigate(['/profiles'])
  }

  onScheduleToggle(): void {
    if (!this.scheduleEnabled) {
      this.formData.scheduleCron = ''
    }
  }

  onGarminToggle(event?: Event): void {
    const isChecked = event ? (event.target as HTMLInputElement).checked : !!(this.formData.garminUsername || this.formData.garminPassword)
    
    if (!isChecked) {
      this.formData.garminUsername = ''
      this.formData.garminPassword = ''
    }
    this.garminEnabled = isChecked
  }

  onTrainerroadToggle(event?: Event): void {
    const isChecked = event ? (event.target as HTMLInputElement).checked : !!(this.formData.trainerroadUsername || this.formData.trainerroadPassword)
    
    if (!isChecked) {
      this.formData.trainerroadUsername = ''
      this.formData.trainerroadPassword = ''
    }
    this.trainerroadEnabled = isChecked
  }

  onResetSessions(): void {
    if (!this.profile) return

    const confirmation = `I confirm that I want to reset my connections to all services. It could be that I have to register apps or enter MFA codes again.`
    
    if (!confirm(confirmation)) {
      return
    }

    this.saving = true
    this.error = null

    this.profileService.resetProfileSessions(this.profile.id).subscribe({
      next: (response) => {
        this.saving = false
        // Show success message
        alert(response.message)
        // Reload the profile to get updated status
        if (this.profile) {
          this.loadProfile(this.profile.id)
        }
      },
      error: (err) => {
        this.error = err.message
        this.saving = false
      }
    })
  }
}
