import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { JsonViewerComponent } from '../../core/json-viewer/json-viewer.component';
import { Track } from '../models/Track';
import JsonFind from 'json-find';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { FlexModule } from '@ngbracket/ngx-layout/flex';

@Component({
    selector: 'mmn-track-detail',
    templateUrl: './track-detail.component.html',
    styleUrls: ['./track-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FlexModule, MatIcon, MatTooltip, MatIconButton]
})
export class TrackDetailComponent {
  @Input() track: Track;
  @Input() index: number;
  @Input() dataDisplay: string;
  @Input() dataDisplayType: string;

  constructor(public dialog: MatDialog) { }

  get displayData(): string {
    let data = this.track?.url?.length > 50 ? this.track?.url?.slice(0, 50) + ' ...' : this.track?.url;
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
}
