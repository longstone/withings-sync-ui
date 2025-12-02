import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { ApiService } from './api.service'
import { SyncRun, RunMode, RunStatus } from '../models/run.model'

@Injectable({
  providedIn: 'root'
})
export class RunService {
  private readonly endpoint = '/runs'

  constructor(private api: ApiService) {}

  getRuns(): Observable<SyncRun[]> {
    return this.api.get<{ runs: SyncRun[] }>(this.endpoint).pipe(
      map(response => response.runs)
    )
  }

  getRunsByProfileId(profileId: string): Observable<SyncRun[]> {
    return this.api.get<{ runs: SyncRun[] }>(`/profiles/${profileId}/runs`).pipe(
      map(response => response.runs)
    )
  }

  getRunById(id: string): Observable<SyncRun> {
    return this.api.get<{ run: SyncRun }>(`${this.endpoint}/${id}`).pipe(
      map(response => response.run)
    )
  }

  startInteractiveRun(profileId: string, logLevel: 'debug' | 'info' | 'warn' | 'error'): Observable<{ sessionId: string, runId: string }> {
    return this.api.post<{ sessionId: string, runId: string }>(`/profiles/${profileId}/run-interactive`, { logLevel })
  }

  startCronRun(profileId: string): Observable<{ runId: string }> {
    return this.api.post<{ runId: string }>(`/profiles/${profileId}/run-cron`)
  }

  killRun(runId: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${runId}/kill`)
  }

  cancelRun(runId: string): Observable<void> {
    return this.api.post<void>(`${this.endpoint}/${runId}/cancel`)
  }

  getRunLog(runId: string): Observable<string> {
    return this.api.get<{ logs: string }>(`${this.endpoint}/${runId}/logs`).pipe(
      map(response => response.logs)
    )
  }
}
