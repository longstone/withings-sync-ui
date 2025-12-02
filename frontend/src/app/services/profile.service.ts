import {Injectable} from '@angular/core'
import {Observable} from 'rxjs'
import {map} from 'rxjs/operators'
import {ApiService} from './api.service'
import {SyncProfile, CreateProfileData, UpdateProfileData} from '../models/profile.model'

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly endpoint = '/profiles'

  constructor(private api: ApiService) {
  }

  getProfiles() {
    return this.api.get<{ profiles: SyncProfile[] }>(`${this.endpoint}`).pipe(
      map(response => response.profiles)
    )
  }

  getProfilesByUserId(userId: string): Observable<SyncProfile[]> {
    const isDefaultUser = !userId || userId === 'default-user'
    const url = isDefaultUser ? this.endpoint : `${this.endpoint}?userId=${userId}`

    return this.api.get<{ profiles: SyncProfile[] }>(url).pipe(
      map(response => response?.profiles ?? [])
    )
  }

  getProfileById(id: string): Observable<SyncProfile> {
    return this.api.get<{ profile: SyncProfile }>(`${this.endpoint}/${id}`).pipe(
      map(response => response.profile)
    )
  }

  createProfile(data: CreateProfileData): Observable<SyncProfile> {
    return this.api.post<SyncProfile>(this.endpoint, data)
  }

  updateProfile(id: string, data: UpdateProfileData): Observable<SyncProfile> {
    return this.api.put<{ profile: SyncProfile }>(`${this.endpoint}/${id}`, data).pipe(
      map(response => response.profile)
    )
  }

  deleteProfile(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`)
  }

  toggleProfile(id: string, enabled: boolean): Observable<SyncProfile> {
    return this.api.put<{ profile: SyncProfile }>(`${this.endpoint}/${id}/toggle`, {enabled}).pipe(
      map(response => response.profile)
    )
  }

  getScheduledProfiles(): Observable<SyncProfile[]> {
    return this.api.get<SyncProfile[]>(`${this.endpoint}/scheduled`)
  }

  resetProfileSessions(id: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`${this.endpoint}/${id}/sessions`)
  }
}
