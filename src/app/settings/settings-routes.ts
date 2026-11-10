import { Routes } from '@angular/router';
import { LayoutComponent } from '../core/layout/layout.component';
import { SettingsComponent } from './settings.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: SettingsComponent }]
  }
];
