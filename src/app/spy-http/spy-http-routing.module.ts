import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LayoutComponent } from '../core/layout/layout.component';
import {SpyHttpComponent} from './spy-http.component';
import {ResultsComponent} from './results/results.component';

const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: SpyHttpComponent }]
  },
  {
    path: 'results',
    component: LayoutComponent,
    children: [{ path: '', component: ResultsComponent }]
    
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SpyHttpRoutingModule {}
