import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SpyHttpComponent } from './spy-http.component';
import { SpyHttpRoutingModule } from './spy-http-routing.module';
import { CoreModule } from '../core/core.module';
import { ActionComponent } from './action/action.component';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { JsonEditorComponent } from './json-editor/json-editor.component';
import {FormsModule} from '@angular/forms';
import {ResultsComponent} from './results/results.component';
import { RecordDialogComponent } from './record-dialog/record-dialog.component';

@NgModule({
    imports: [CommonModule, CoreModule, FormsModule, SpyHttpRoutingModule, ScrollingModule, DragDropModule, SpyHttpComponent, ActionComponent, JsonEditorComponent, ResultsComponent, RecordDialogComponent]
})
export class SpyHttpModule {}
