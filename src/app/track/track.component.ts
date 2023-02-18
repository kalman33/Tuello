import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import * as moment from 'moment';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { saveAs } from 'file-saver';
import { Track } from './models/Track';
import { TrackType } from './models/TrackType';

@Component({
  selector: 'mmn-track',
  templateUrl: './track.component.html',
  styleUrls: ['./track.component.scss']
})
export class TrackComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput: ElementRef;

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  trackPlayActivated: boolean;
  tracks;
  _trackData: string;
  currentHrefLocation: string;
  selectedTrackId: string;
  sub;

  constructor(
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private ngZone: NgZone,
    public dialog: MatDialog,
    private ref: ChangeDetectorRef,
    private infoBar: MatSnackBar,
    private route: ActivatedRoute
  ) {}

  get trackData(): string {
    return this._trackData;
  }

  set trackData(value: string) {
    this._trackData = value;
    chrome.storage.local.set({ tuelloTrackData: value });
  }

  ngOnInit() {
    chrome.tabs.query({ active: true }, tabs => {
      this.currentHrefLocation = tabs[0].url;
    });

    this.sub = this.route.queryParams.subscribe(params => {
      this.selectedTrackId = params['trackId'];
    });

    chrome.storage.local.get(['trackPlay'], results => {
      if (results['trackPlay']) {
        this.trackPlayActivated = results['trackPlay'];
        chrome.runtime.sendMessage({
          action: 'TRACK_PLAY_STATE',
          value: true
        });
      }
      this.ref.detectChanges();
    });

    // recupération des enregistrements
    chrome.storage.local.get(['tuelloTracks'], results => {
      this.tracks = results['tuelloTracks'];
    });

    // récupération du tracking data
    chrome.storage.local.get(['tuelloTrackData'], results => {
      this.trackData = results['tuelloTrackData'];
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.refreshTrackData) {
        // recupération des enregistrements
        chrome.storage.local.get(['tuelloTracks'], results => {
          this.ngZone.run(() => (this.tracks = results['tuelloTracks']));
        });
      }
      sendResponse();
    });
  }

  /**
   * Efface les enregistrements stockés dans le localstorage
   */
  effacerEnregistrements() {
    chrome.storage.local.remove(['tuelloTracks']);
    this.tracks = null;
    chrome.storage.local.get(['trackPlay'], results => {
      if (results['trackPlay']) {
        this.trackPlayActivated = results['trackPlay'];
        chrome.runtime.sendMessage({
          action: 'TRACK_PLAY_STATE',
          value: this.trackPlayActivated
        });
      }
    });
  }

  /**
   * Permet d'activer le mode play
   */
  toggleTrackPlay(e) {
    if (this.trackPlayActivated && !this.trackData) {
      // il faut que l'input des données à tracker soit renseigné
      this.infoBar.open(this.translate.instant('mmn.track.input.required'), '', {
        duration: 2000,
        verticalPosition: 'top',
        horizontalPosition: 'center'
      });
      e.source.checked = false;
    } else {
      chrome.storage.local.set({ trackPlay: this.trackPlayActivated });
      chrome.runtime.sendMessage({
        action: 'TRACK_PLAY_STATE',
        value: this.trackPlayActivated
      });
    }
  }

  save() {
    const value = moment(new Date()).format('YYYY-MM-DD_HH-mm');
    const txtBlob = new Blob([this.tracks], { type: 'text/plain;charset=utf-8' });
    saveAs(txtBlob, `tuello.http.${value}.json`);
  }

  isSelectedClass(track: Track) {
    let selected = false;   
    if (this.selectedTrackId && track.hrefLocation === this.currentHrefLocation && this.trackPlayActivated) {
      if (this.selectedTrackId.includes('tuelloTrackClick')) {
        selected = this.selectedTrackId == track.id;
      } else {
        selected = (track.type === TrackType.PAGE) ? true : false ;
      }
    }
    
   
    return { selected };
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
