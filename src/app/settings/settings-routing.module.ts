import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import {LayoutComponent} from '../core/layout/layout.component';
import {RecorderHttpComponent} from '../recorder-http/recorder-http.component';
import {SettingsComponent} from './settings.component';


const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [{ path: '', component: SettingsComponent }],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SettingsRoutingModule { }
