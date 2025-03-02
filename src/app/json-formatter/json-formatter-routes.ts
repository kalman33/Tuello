import { Routes } from '@angular/router';
import { LayoutComponent } from '../core/layout/layout.component';
import { JsonFormatterComponent } from './json-formatter.component';


export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: JsonFormatterComponent }],
  },
];

