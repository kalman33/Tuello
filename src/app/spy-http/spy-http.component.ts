import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { TranslateService } from '@ngx-translate/core';

import { saveAs } from 'file-saver';
import { RecorderHistoryService } from './services/recorder-history.service';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Action } from './models/Action';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PlayerService } from './services/player.service';
import { ChromeExtentionUtilsService } from '../core/utils/chrome-extention-utils.service';
import { MatTabGroup } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { PausableObservable } from 'rxjs-pausable';
import { HttpReturn } from '../recorder-http/models/http.return';
import { MatDialog } from '@angular/material/dialog';
import { JsonViewerComponent } from '../core/json-viewer/json-viewer.component';
import { RecordDialogComponent } from './record-dialog/record-dialog.component';
import { formatDate } from '../core/utils/date-utils';

@Component({
  selector: 'mmn-spy-http',
  templateUrl: './spy-http.component.html',
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./spy-http.component.scss']
})
export class SpyHttpComponent implements OnInit, OnDestroy {
  spyActif: boolean;
  pausable: PausableObservable<Action>;
  actions: Action[];
  pausedAction = 0;

  uiRecordListener;
  resumerPauseListener;

  jsonContent: string;

  showResults = false;

  @ViewChild('fileInput') fileInput: ElementRef;
  @ViewChild(CdkVirtualScrollViewport, { static: false })
  viewport: CdkVirtualScrollViewport;
  @ViewChild('tabGrp', { static: false })
  tabGrp: MatTabGroup;

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  constructor(
    private translate: TranslateService,
    public recorderHistoryService: RecorderHistoryService,
    private changeDetectorRef: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private translateService: TranslateService,
    public playerService: PlayerService,
    private chromeExtentionUtilsService: ChromeExtentionUtilsService,
    private router: Router,
    private ngZone: NgZone,
    public dialog: MatDialog
  ) { }

  ngOnInit() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'UI_RECORD_CHANGED') {
        this.recorderHistoryService.record = message.value;
      }
      sendResponse();
    });

    chrome.storage.local.get(['uiRecordActivated'], results => {
      if (results['uiRecordActivated']) {
        this.spyActif = true;
        // on previent background qui va prevenir contentscript qu'on a démarré le recording
        chrome.runtime.sendMessage({
          action: 'START_UI_RECORDER',
          value: true
        }, ()=>{});
      } else {
        this.spyActif = false;
      }
    });

    this.recorderHistoryService.loadUiRecordFromLocalStorage();
    this.actions = this.recorderHistoryService.record ? this.recorderHistoryService.record.actions : null;
  }

  startRecording() {

    if (this.actions && this.actions.length > 0) {
      const dialogRef = this.dialog.open(RecordDialogComponent);

      dialogRef.afterClosed().subscribe(result => {
        if (result !== 'add') {
          this.actions = [];
          this.jsonContent = '';
          this.recorderHistoryService.deleteAll();
        }
        this.spyActif = true;
        this.chromeExtentionUtilsService.toggle();
        this.recorderHistoryService.startRecording();
      });
    } else {
      this.spyActif = true;
      this.chromeExtentionUtilsService.toggle();
      this.recorderHistoryService.startRecording();
    }
  }

  stopRecording() {
    this.spyActif = false;
    // on stock l'état dans le storage
    chrome.storage.local.set({ uiRecordActivated: false });
    // modif de l'icone du plugin pour le mettre en mode normal
    chrome.runtime.sendMessage({
      action: 'updateIcon',
      value: 'tuello-32x32.png'
    }, ()=>{});

    // on previent background qui va prevenir contentscript qu'on a stopé le recording
    chrome.runtime.sendMessage({
      action: 'START_UI_RECORDER',
      value: false
    }, ()=>{});
    if (this.recorderHistoryService.record) {
      this.actions = this.recorderHistoryService.record.actions;
      this.jsonContent = JSON.stringify(this.recorderHistoryService.record);
    }
  }

  deleteRecords() {
    this.playerService.comparisonResults = null;
    this.actions = [];
    this.jsonContent = '';
    this.recorderHistoryService.deleteAll();
  }

  save() {
    if (this.recorderHistoryService.record) {
      const value = formatDate(new Date());
      const txtBlob = new Blob([JSON.stringify(this.recorderHistoryService.record)], { type: 'text/plain;charset=utf-8' });
      saveAs(txtBlob, `tuello.${value}.json`);
    }
  }

  public startPlaying() {
    this.playerService.comparisonResults = null;
    this.spyActif = false;

    // permet de demander de scroller en 0,0 sur toutes les iframes
    chrome.runtime.sendMessage({
      action: 'PLAY_USER_ACTION_INIT'
    }, ()=> {});

    chrome.runtime.sendMessage({
      action: 'updateIcon',
      value: 'tuello-play-32x32.png'
    }, ()=>{});

    // Mock http
    chrome.runtime.sendMessage({
      action: 'MOCK_HTTP_USER_ACTION',
      value: true,
      data: this.recorderHistoryService.record.httpRecords
    }, ()=>{});

    // on cache l'extension
    this.chromeExtentionUtilsService.hide();

    // on retaille l'écran à la meme taille que celle de l'enregistrement

    chrome.windows.getCurrent((window) => {
      let updateInfo = {
        width: this.recorderHistoryService.record.windowSize.width,
        height: this.recorderHistoryService.record.windowSize.height,
        top: this.recorderHistoryService.record.windowSize.top,
        left: this.recorderHistoryService.record.windowSize.left
      };
      ((updateInfo as any).state = "normal"), chrome.windows.update(window.id, updateInfo,
        () =>
          this.launchActions()
      );
    });

  }

  private launchActions() {
    // const hasScreenshot = this.actions.find(action => action.actionType === 'SCREENSHOT');
    chrome.runtime.sendMessage({
      action: 'PLAY_USER_ACTIONS',
      value: this.actions
    }, ()=>{});
  }

  public onChange(fileList: any): void {
    const file = fileList.target.files[0];
    const fileReader: FileReader = new FileReader();
    fileReader.onloadend = x => {
      this.jsonContent = fileReader.result as string;
      this.snackBar.open(
        this.translate.instant('mmn.spy-http.import.message'),
        this.translate.instant('mmn.spy-http.import.success.action'),
        { duration: 2000 }
      );
      this.recorderHistoryService.importJson(this.jsonContent);
      this.actions = this.recorderHistoryService.record.actions;
      this.tabGrp.selectedIndex = 0;
    };
    fileReader.onerror = event => {
      this.snackBar.open(
        this.translate.instant('mmn.spy-http.import.message'),
        this.translate.instant('mmn.spy-http.import.error.action'),
        { duration: 2000 }
      );
      fileReader.abort();
    };
    fileReader.readAsText(file);
  }

  selectFile() {
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  /**
   * Gestion du drag & drop
   */
  onTaskDrop(event: CdkDragDrop<Action[]>) {
    if (event.previousContainer === event.container) {
      // on echange les delay
      if (this.actions[event.previousIndex] && this.actions[event.currentIndex]) {
        moveItemInArray(this.actions, event.previousIndex, event.currentIndex);
        /**this.actions = [...this.actions];
        this.changeDetectorRef.detectChanges();
        this.viewport.setRenderedRange({ start: 0, end: this.viewport.getRenderedRange().end + 1 });
        this.viewport.checkViewportSize();*/

        // on sauvegarde 
        this.saveActionsOnLocalStorage();
      }
    }
  }

  /**
   * Suppression d'une action
   */
  deleteAction(index: number) {
    if (index >= 0) {
      this.actions.splice(index, 1);
      this.actions = [...this.actions];
      // on sauvegarde 
      this.saveActionsOnLocalStorage();
    }
  }

  /**
   * dupliquer une action
   */
  duplicateAction(index: number) {
    const action = this.actions[index];
    if (index >= 0) {
      this.actions.splice(index + 1, 0, { ...action });
      this.actions = [...this.actions];
      // this.changeDetectorRef.detectChanges();
      this.viewport.setRenderedRange({ start: 0, end: this.viewport.getRenderedRange().end + 1 });
      this.viewport.checkViewportSize();

      // on sauvegarde 
      this.saveActionsOnLocalStorage();
    }
  }

  modifyAction(tuple: [number, Action]) {
    this.actions[tuple[0]] = tuple[1];
    // on sauvegarde 
    this.saveActionsOnLocalStorage();
  }

  previewAction(indexAction: number) {
    chrome.runtime.sendMessage({
      action: 'VIEW_CLICK_ACTION',
      value: this.actions[indexAction].userAction
    }, ()=>{});
  }

  /**
   * 
   * @param index permet de passer le delay à 1ms sur l'action
   */
  decreaseDelayAction(index: number) {
    if (index >= 0) {
      if (this.actions[index]) {
        this.actions[index].delay = 10;
      };
      // on sauvegarde 
      this.saveActionsOnLocalStorage();
    }
  }

  /**
   * permet de visualiser le flux http
   */
  visualiserFlux(httpRecord: HttpReturn) {
    const dialogRef = this.dialog.open(JsonViewerComponent, {
      data: httpRecord,
      maxWidth: '98vw',
      width: '98%'
    });
  }

  ngOnDestroy(): void {
    // tslint:disable-next-line: deprecation
    // chrome.storage.onChanged.removeListener(this.uiRecordListener);
    //chrome.storage.onChanged.removeListener(this.resumerPauseListener);
  }

  private saveActionsOnLocalStorage() {
    this.recorderHistoryService.record.actions = this.actions;
    this.recorderHistoryService.saveUiRecordToLocalStorage();

  }
}
