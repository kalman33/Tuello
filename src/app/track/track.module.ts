import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { CoreModule } from '../core/core.module';

import { FormsModule } from '@angular/forms';
import { TrackDetailComponent } from './detail/track-detail.component';
import { SelectTrackDirective } from './selec.track.directive';
import { TrackRoutingModule } from './track-routing.module';
import { TrackComponent } from './track.component';

@NgModule({
  declarations: [TrackComponent, TrackDetailComponent, SelectTrackDirective],
  imports: [CommonModule, CoreModule, FormsModule, TrackRoutingModule]
})
export class TrackModule {}
