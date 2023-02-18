import {Component, Input, OnInit} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import { JsonViewerComponent } from '../../core/json-viewer/json-viewer.component';
import { Track } from '../models/Track';

@Component({
  selector: 'mmn-track-detail',
  templateUrl: './track-detail.component.html',
  styleUrls: ['./track-detail.component.scss']
})
export class TrackDetailComponent implements OnInit {
  @Input() track: Track;
  @Input() index: number;

  constructor(public dialog: MatDialog) {}

  ngOnInit() {}

  previewTrack() {
    const dialogRef = this.dialog.open(JsonViewerComponent, {
      data: this.omit(this.track, 'element'),
      maxWidth: '98vw',
      width: '98%'
    });
  }

  /**
   * permet d'enlever une clef dans le flux json
   * @param obj 
   * @param key 
   * @returns le flux json avec la clef supprimée
   */
  omit(obj, key) {
    const {[key]:ignore, ...rest} = obj;
    return rest;
  }

}
