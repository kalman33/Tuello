import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SettingsRoutingModule } from './settings-routing.module';
import { SettingsComponent } from './settings.component';
import {CoreModule} from '../core/core.module';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { SettingsMenuComponent } from './menus/settings-menu.component';


@NgModule({
  declarations: [SettingsComponent, SettingsMenuComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CoreModule,
    SettingsRoutingModule,
  ]
})
export class SettingsModule { }
