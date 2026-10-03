import { Routes } from '@angular/router';
import { LayoutComponent } from '../core/layout/layout.component';
import { ReportComponent } from './report.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: ReportComponent }]
  }
];
