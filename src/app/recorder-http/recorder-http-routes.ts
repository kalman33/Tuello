import { Routes } from '@angular/router';

import { LayoutComponent } from '../core/layout/layout.component';
import { AddTagsComponent } from './add-tags/add-tags.component';
import { RecorderHttpPageComponent } from './recorder-http-page.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: '',
        component: RecorderHttpPageComponent
      }, {
        path: 'tags',
        component: AddTagsComponent
      }],
  }


];