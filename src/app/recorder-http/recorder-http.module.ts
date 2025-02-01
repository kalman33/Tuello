import { ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoreModule } from '../core/core.module';
import { AddTagsComponent } from './add-tags/add-tags.component';
import { ExportComponent } from './export/export.component';
import { RecorderHttpRoutingModule } from './recorder-http-routing.module';
import { RecorderHttpComponent } from './recorder-http.component';
import { RecorderHttpSettingsComponent } from './settings/recorder-http-settings.component';

const COMPONENTS = [RecorderHttpComponent, ExportComponent, AddTagsComponent, RecorderHttpSettingsComponent];

const DIRECTIVES = [];

@NgModule({
  declarations: [...COMPONENTS, ...DIRECTIVES],
  imports: [
    CommonModule,
    FormsModule,
    CoreModule,
    RecorderHttpRoutingModule,
    ScrollingModule
  ]
})
export class RecorderHttpModule {}
