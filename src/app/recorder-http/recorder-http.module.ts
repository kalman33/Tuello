import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecorderHttpComponent } from './recorder-http.component';
import { FormsModule } from '@angular/forms';
import {RecorderHttpRoutingModule} from './recorder-http-routing.module';
import {CoreModule} from '../core/core.module';
import { ExportComponent } from './export/export.component';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AddTagsComponent } from './add-tags/add-tags.component';
import { TagComponent } from './add-tags/tag/tag.component';

const COMPONENTS = [RecorderHttpComponent, ExportComponent, AddTagsComponent, TagComponent];

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
