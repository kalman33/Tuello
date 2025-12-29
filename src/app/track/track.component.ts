import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatList, MatListItem } from '@angular/material/list';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { CompressionService } from '../core/compression/compression.service';
import { formatDate } from '../core/utils/date-utils';
import { TrackDetailComponent } from './detail/track-detail.component';
import { Track } from './models/Track';
import { TrackType } from './models/TrackType';
import { SelectTrackDirective } from './selec.track.directive';
import { TrackService } from './services/track.service';

@Component({
    selector: 'mmn-track',
    templateUrl: './track.component.html',
    styleUrls: ['./track.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FlexModule, FormsModule, NgClass, ExtendedModule, MatButton, MatIcon, MatSlideToggle, MatRadioGroup, MatRadioButton, MatFormField, MatLabel, MatInput, MatList, SelectTrackDirective, MatListItem, TrackDetailComponent, TranslatePipe]
})
export class TrackComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput: ElementRef;

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  trackPlayActivated: boolean;
  tracks;
  _trackData: string;
  _trackDataDisplay: string;
  _trackDataDisplayType: string;
  selectedTrackId: string;
  sub;
  private chromeMessageListener: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => boolean | void;

  constructor(
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private ngZone: NgZone,
    public dialog: MatDialog,
    private ref: ChangeDetectorRef,
    private infoBar: MatSnackBar,
    private route: ActivatedRoute,
    private router: Router,
    private trackService: TrackService,
    private compressionService: CompressionService
  ) { }

  get trackData(): string {
    return this._trackData;
  }

  set trackData(value: string) {
    this._trackData = value;
    chrome.storage.local.set({ tuelloTrackData: value });
  }

  get trackDataDisplayType(): string {
    return this._trackDataDisplayType;
  }

  set trackDataDisplayType(value: string) {
    this._trackDataDisplayType = value;
    chrome.storage.local.set({ tuelloTrackDataDisplayType: value });
  }

  get trackDataDisplay(): string {
    return this._trackDataDisplay;
  }

  set trackDataDisplay(value: string) {
    this._trackDataDisplay = value;
    chrome.storage.local.set({ tuelloTrackDataDisplay: value });
  }

  ngOnInit() {
    this.router.routeReuseStrategy.shouldReuseRoute = () => false;
    this.router.onSameUrlNavigation = 'reload';

    this.sub = this.route.queryParams.subscribe(params => {
      this.selectedTrackId = params['trackId'];
    });

    // Chargement des données non compressées
    chrome.storage.local.get([
      'trackPlay',
      'tuelloTrackData',
      'tuelloTrackDataDisplay',
      'tuelloTrackDataDisplayType'
    ], results => {
      if (results['trackPlay']) {
        this.trackPlayActivated = results['trackPlay'];
        chrome.runtime.sendMessage({
          action: 'TRACK_PLAY_STATE',
          value: true
        }, () => { });
      }
      this._trackData = results['tuelloTrackData'];
      this._trackDataDisplay = results['tuelloTrackDataDisplay'];
      this._trackDataDisplayType = results['tuelloTrackDataDisplayType'];
      this.ref.detectChanges();
    });

    // Chargement des tracks avec décompression LZ
    this.compressionService.loadCompressed<any[]>('tuelloTracks').then(tracks => {
      this.tracks = tracks || [];
      this.ref.detectChanges();
    }).catch(() => {
      this.tracks = [];
      this.ref.detectChanges();
    });

    this.chromeMessageListener = (message, sender, sendResponse) => {
      if (message.refreshTrackData) {
        // recupération des enregistrements avec décompression LZ
        this.compressionService.loadCompressed<any[]>('tuelloTracks').then(tracks => {
          this.ngZone.run(() => (this.tracks = tracks || []));
          sendResponse();
        }).catch(() => {
          this.ngZone.run(() => (this.tracks = []));
          sendResponse();
        });
      } else {
        sendResponse();
      }
      return true;
    };
    chrome.runtime.onMessage.addListener(this.chromeMessageListener);
  }


  /**
   * Efface les enregistrements stockés dans le localstorage
   */
  effacerEnregistrements() {
    chrome.storage.local.remove(['tuelloTracks']);
    this.tracks = null;
    this.ref.detectChanges();
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

  isSelected(track: Track): boolean {
    if (!this.selectedTrackId || track.hrefLocation !== this.trackService.currentHrefLocation || !this.trackPlayActivated) {
      return false;
    }
    if (this.selectedTrackId.includes('tuelloTrackClick')) {
      return this.selectedTrackId === track.id;
    }
    return track.type === TrackType.PAGE;
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    // Suppression du listener Chrome pour éviter les fuites mémoire
    if (this.chromeMessageListener) {
      chrome.runtime.onMessage.removeListener(this.chromeMessageListener);
    }
  }


}
