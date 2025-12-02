import { Routes } from '@angular/router';
import { ProfileListComponent } from './components/profile-list/profile-list.component';
import { ProfileFormComponent } from './components/profile-form/profile-form.component';
import { RunHistoryComponent } from './components/run-history/run-history.component';
import { TerminalComponent } from './components/terminal/terminal.component';
import { SettingsComponent } from './components/settings/settings.component';

export const routes: Routes = [
  { path: '', redirectTo: '/profiles', pathMatch: 'full' },
  { path: 'profiles', component: ProfileListComponent },
  { path: 'profiles/new', component: ProfileFormComponent },
  { path: 'profiles/:id', component: ProfileFormComponent },
  { path: 'profiles/:profileId/runs', component: RunHistoryComponent },
  { path: 'terminal', component: TerminalComponent },
  { path: 'terminal/:profileId', component: TerminalComponent },
  { path: 'settings', component: SettingsComponent }
];
