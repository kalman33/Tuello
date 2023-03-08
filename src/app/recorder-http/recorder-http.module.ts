import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecorderHttpComponent } from './recorder-http.component';
import { FormsModule } from '@angular/forms';
import {RecorderHttpRoutingModule} from './recorder-http-routing.module';
import {CoreModule} from '../core/core.module';
import { ExportComponent } from './export/export.component';

const COMPONENTS = [RecorderHttpComponent, ExportComponent];

const DIRECTIVES = [];

@NgModule({
  declarations: [...COMPONENTS, ...DIRECTIVES],
  imports: [
    CommonModule,
    FormsModule,
    CoreModule,
    RecorderHttpRoutingModule
  ]
})
export class RecorderHttpModule {}
