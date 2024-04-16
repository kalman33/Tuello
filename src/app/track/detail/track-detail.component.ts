import { Component, Input, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { JsonViewerComponent } from '../../core/json-viewer/json-viewer.component';
import { Track } from '../models/Track';
import JsonFind from 'json-find';

@Component({
  selector: 'mmn-track-detail',
  templateUrl: './track-detail.component.html',
  styleUrls: ['./track-detail.component.scss']
})
export class TrackDetailComponent implements OnInit {
  @Input() track: Track;
  @Input() index: number;
  @Input() dataDisplay: string;
  @Input() dataDisplayType: string;

  constructor(public dialog: MatDialog) { }

  ngOnInit() { }

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
    const { [key]: ignore, ...rest } = obj;
    return rest;
  }


  findInJson(data: any, keyString: string) {
    keyString = keyString.trim();
    let result = '';
    const doc = JsonFind(data);
    try {
      if (keyString.includes(',') || keyString.includes(';')) {
        keyString.split(/,|;/).forEach(elt => {
          elt = elt.trim();
          result += result ? ' | ' : '';
          result += elt + ' : ' + doc.findValues(elt)[elt];
        });
      } else {
        result = doc.findValues(keyString);
        result = `${keyString} : ${result[keyString]}`;
      }
    } catch (e) {
      result = data;
    }
    return result;
  
  }

  /**
   * Permet d'afficher les données que l'on veut tracer
   */
  getDisplayData(): string {
    let data = this.track?.url.length > 50 ? this.track?.url?.slice(0, 50) + ' ...' : this.track?.url;
    if (this.dataDisplay) {
      if (this.dataDisplayType === 'body') {
        if (this.track?.body) {
          data = this.findInJson(this.track.body, this.dataDisplay);
        }
      } else {
        if (this.track?.querystring && this.track?.querystring['' + this.dataDisplay]) {
          data = `${this.dataDisplay} : ${this.track?.querystring['' + this.dataDisplay]}`;
        }
      }
    }
    return data;
  }
}
