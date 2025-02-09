import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { RecorderHttpComponent } from './recorder-http.component';
import { LayoutComponent } from '../core/layout/layout.component';
import { AddTagsComponent } from './add-tags/add-tags.component';

const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        component: RecorderHttpComponent
      }, {
        path: 'tags',
        component: AddTagsComponent
      }],
  }


];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RecorderHttpRoutingModule { }
