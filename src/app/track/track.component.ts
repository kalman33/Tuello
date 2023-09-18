import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { formatDate } from '../core/utils/date-utils';
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
  _trackDataDisplay: string;
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
  ) { }

  get trackData(): string {
    return this._trackData;
  }

  set trackData(value: string) {
    this._trackData = value;
    chrome.storage.local.set({ tuelloTrackData: value });
  }

  get trackDataDisplay(): string {
    return this._trackDataDisplay;
  }

  set trackDataDisplay(value: string) {
    this._trackDataDisplay = value;
    chrome.storage.local.set({ tuelloTrackDataDisplay: value });
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
        }, () => { });
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

    // récupération du tracking data display
    chrome.storage.local.get(['tuelloTrackDataDisplay'], results => {
      this.trackDataDisplay = results['tuelloTrackDataDisplay'];
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.refreshTrackData) {
        // recupération des enregistrements
        chrome.storage.local.get(['tuelloTracks'], results => {
          this.ngZone.run(() => (this.tracks = results['tuelloTracks']));
          sendResponse();
        });
      } else {
        sendResponse();
      }
      return true;
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
        }, () => { });
      }
    });
  }

  /** Sortie du champs input */
  focusOut() {
    if (!this.trackData) {
      this.trackPlayActivated = false;
      // il faut que l'input des données à tracker soit renseigné
      this.infoBar.open(this.translate.instant('mmn.track.input.required'), '', {
        duration: 2000,
        verticalPosition: 'top',
        horizontalPosition: 'center'
      });
    } else if (!this.trackPlayActivated) {
      // this.trackPlayActivated = true;
      // chrome.storage.local.set({ trackPlay: this.trackPlayActivated }); 
    }
    chrome.runtime.sendMessage({
      action: 'TRACK_PLAY_STATE',
      value: this.trackPlayActivated
    }, () => { });
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
      this.trackPlayActivated = false;
    } else {
      chrome.storage.local.set({ trackPlay: this.trackPlayActivated });

    }
    chrome.runtime.sendMessage({
      action: 'TRACK_PLAY_STATE',
      value: this.trackPlayActivated
    }, () => { });
  }

  save() {
    const value = formatDate(new Date());
    const txtBlob = new Blob([JSON.stringify(this.tracks)], { type: 'text/plain;charset=utf-8' });
    saveAs(txtBlob, `tuello.tracks.${value}.json`);
  }

  isSelectedClass(track: Track) {
    let selected = false;
    if (this.selectedTrackId && track.hrefLocation === this.currentHrefLocation && this.trackPlayActivated) {
      if (this.selectedTrackId.includes('tuelloTrackClick')) {
        selected = this.selectedTrackId == track.id;
      } else {
        selected = (track.type === TrackType.PAGE) ? true : false;
      }
    }


    return { selected };
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
