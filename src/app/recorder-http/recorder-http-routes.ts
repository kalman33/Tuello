import { Routes } from '@angular/router';

import { LayoutComponent } from '../core/layout/layout.component';
import { AddTagsComponent } from './add-tags/add-tags.component';
import { RecorderHttpComponent } from './recorder-http.component';

export const routes: Routes = [
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