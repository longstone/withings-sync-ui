import {ChangeDetectorRef, Component, OnInit} from '@angular/core'
import {Router} from '@angular/router'
import {CommonModule} from '@angular/common'
import {finalize} from 'rxjs/operators'
import {ProfileService} from '../../services/profile.service'
import {SyncProfile} from '../../models/profile.model'
import {CustomDatePipe} from '../../pipes/custom-date.pipe'

@Component({
  selector: 'app-profile-list',
  standalone: true,
  imports: [CommonModule, CustomDatePipe],
  templateUrl: './profile-list.component.html',
  styleUrl: './profile-list.component.scss'
})
export class ProfileListComponent implements OnInit {
  profiles: SyncProfile[] = []
  loading: boolean = false
  error: string | null = null

  constructor(
    private profileService: ProfileService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
  }

  ngOnInit(): void {
    this.loadProfiles()
  }

  loadProfiles(): void {
    this.loading = true
    this.error = null

    this.profileService.getProfiles()
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.detectChanges()
      }))
      .subscribe({
        next: (profiles: SyncProfile[]): void => {
          this.profiles = profiles ?? []
        },
        error: (err: Error): void => {
          this.error = err.message
        }
      })
  }

  onViewDetails(profile: SyncProfile): void {
    this.router.navigate(['/profiles', profile.id])
  }

  onViewRuns(profile: SyncProfile): void {
    this.router.navigate(['/profiles', profile.id, 'runs'])
  }

  onCreateProfile(): void {
    this.router.navigate(['/profiles', 'new'])
  }

  onToggleProfile(profile: SyncProfile): void {
    this.profileService.toggleProfile(profile.id, !profile.enabled)
      .pipe(finalize(() => {
        this.cdr.detectChanges()
      }))
      .subscribe({
        next: (updatedProfile:SyncProfile) => {
          const index = this.profiles.findIndex(profile => profile.id === updatedProfile.id);
          if (index >= 0) {
            this.profiles[index] = updatedProfile
            // Reload profiles to get updated schedule information
            this.loadProfiles()
          }
        },
        error: (err) => {
          this.error = err.message
        }
      })
  }

  onDeleteProfile(profile: SyncProfile): void {
    if (confirm(`Delete profile "${profile.name}"? This will remove all run history and session files.`)) {
      this.profileService.deleteProfile(profile.id).subscribe({
        next: () => {
          this.profiles = this.profiles.filter(p => p.id !== profile.id)
          this.cdr.detectChanges()
        },
        error: (err) => {
          this.error = err.message
          this.cdr.detectChanges()
        }
      })
    }
  }

  protected onRun(profile: SyncProfile) {
    this.router.navigate(['/terminal'], { queryParams: { profileId: profile.id } })
  }
}
