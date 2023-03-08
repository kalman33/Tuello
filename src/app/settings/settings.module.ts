import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SettingsRoutingModule } from './settings-routing.module';
import { SettingsComponent } from './settings.component';
import {CoreModule} from '../core/core.module';
import {FormsModule} from '@angular/forms';


@NgModule({
  declarations: [SettingsComponent],
  imports: [
    CommonModule,
    FormsModule,
    CoreModule,
    SettingsRoutingModule
  ]
})
export class SettingsModule { }
