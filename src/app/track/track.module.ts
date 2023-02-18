import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CoreModule } from '../core/core.module';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DragDropModule } from '@angular/cdk/drag-drop';
import {FormsModule} from '@angular/forms';
import { TrackComponent } from './track.component';
import { TrackDetailComponent } from './detail/track-detail.component';
import { TrackRoutingModule } from './track-routing.module';

@NgModule({
  declarations: [TrackComponent, TrackDetailComponent],
  imports: [CommonModule, CoreModule, FormsModule, TrackRoutingModule, ScrollingModule, DragDropModule]
})
export class TrackModule {}
