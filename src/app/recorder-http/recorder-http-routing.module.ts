import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { RecorderHttpComponent } from './recorder-http.component';
import { LayoutComponent } from '../core/layout/layout.component';

const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: RecorderHttpComponent }],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RecorderHttpRoutingModule {}
