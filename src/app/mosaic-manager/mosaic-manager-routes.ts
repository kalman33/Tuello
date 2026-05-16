import { Routes } from '@angular/router';
import { LayoutComponent } from '../core/layout/layout.component';
import { MosaicManagerComponent } from './mosaic-manager.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: MosaicManagerComponent }]
  }
];
