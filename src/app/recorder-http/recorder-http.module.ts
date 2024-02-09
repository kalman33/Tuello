import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecorderHttpComponent } from './recorder-http.component';
import { FormsModule } from '@angular/forms';
import {RecorderHttpRoutingModule} from './recorder-http-routing.module';
import {CoreModule} from '../core/core.module';
import { ExportComponent } from './export/export.component';
import { AddHeadersComponent } from './add-headers/add-headers.component';
import { HeaderComponent } from './add-headers/header/header.component';
import { ScrollingModule } from '@angular/cdk/scrolling';

const COMPONENTS = [RecorderHttpComponent, ExportComponent, AddHeadersComponent, HeaderComponent];

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
