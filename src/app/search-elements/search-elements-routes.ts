import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LayoutComponent } from '../core/layout/layout.component';
import { SearchElementsComponent } from './search-elements.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: SearchElementsComponent }]
  }
];

