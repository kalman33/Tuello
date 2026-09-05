import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';

import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatList, MatListItem, MatListItemIcon, MatListItemLine, MatListItemMeta, MatListItemTitle, MatNavList } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTab, MatTabGroup, MatTabLabel } from '@angular/material/tabs';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { MAC_MODIFIER_LABELS, MAC_MODIFIER_TITLES, resolvePlatform, TuelloPlatform } from 'chrome/src/utils/platform';
import { getKeyCode } from 'chrome/src/utils/utils';
import { saveAs } from 'file-saver';
import { Subscription, take } from 'rxjs';
import { PausableObservable } from 'rxjs-pausable';
import { JsonViewerComponent } from '../core/json-viewer/json-viewer.component';
import { Scenario } from '../core/scenarios/scenario.models';
import { ScenarioStorageService } from '../core/scenarios/scenario-storage.service';
import { MosaicStorageService } from '../mosaic/services/mosaic-storage.service';
import { ChromeExtentionUtilsService } from '../core/utils/chrome-extention-utils.service';
import { formatDate } from '../core/utils/date-utils';
import { HttpReturn } from '../recorder-http/models/http.return';
import { ActionComponent } from './action/action.component';
import { Action } from './models/Action';
import { RecordDialogComponent } from './record-dialog/record-dialog.component';
import { SaveScenarioDialogComponent, SaveScenarioDialogData } from './scenario-dialog/save-scenario-dialog.component';
import { PlayerService } from './services/player.service';
import { RecorderHistoryService } from './services/recorder-history.service';

@Component({
  selector: 'mmn-spy-http',
  templateUrl: './spy-http.component.html',
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./spy-http.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FlexModule,
    FormsModule,
    NgClass,
    ExtendedModule,
    MatButton,
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatTabGroup,
    MatTab,
    MatTabLabel,
    MatList,
    CdkDropList,
    MatListItem,
    MatListItemIcon,
    MatListItemTitle,
    MatListItemLine,
    MatListItemMeta,
    ActionComponent,
    CdkDrag,
    MatNavList,
    MatFormField,
    MatInput,
    MatError,
    RouterLink,
    TranslatePipe
  ]
})
export class SpyHttpComponent implements OnInit, OnDestroy {
  spyActif: boolean;
  pausable: PausableObservable<Action>;
  actions: Action[];
  pausedAction = 0;
  screenshot = 'S';
  comment = 'C';
  captureImage = 'I';

  /** Libellés des touches de modification, adaptés au clavier de l'OS courant */
  platform: TuelloPlatform = 'other';
  altLabel = 'Alt';
  shiftLabel = 'Maj';
  altTooltip = '';
  shiftTooltip = '';
  platformHint = '';

  uiRecordListener;
  resumerPauseListener;
  private chromeMessageListener: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void;

  jsonContent: string;

  showResults = false;

  scenarios: Scenario[] = [];
  private scenariosSubscription: Subscription;
  private langChangeSubscription: Subscription;

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
    private scenarioStorageService: ScenarioStorageService,
    private mosaicStorageService: MosaicStorageService,
    public dialog: MatDialog
  ) {}

  ngOnInit() {
    this.chromeMessageListener = (message, sender, sendResponse) => {
      // Ce listener reçoit tous les messages de l'extension, y compris ceux
      // adressés au background : ne répondre qu'aux siens, sinon le canal est
      // fermé avant que le destinataire réel ait répondu.
      if (message.action !== 'UI_RECORD_CHANGED') {
        return false;
      }
      this.ngZone.run(() => {
        this.recorderHistoryService.record = message.value;
        // Synchroniser les actions locales avec le record mis à jour
        this.actions = message.value?.actions ?? null;
        this.changeDetectorRef.detectChanges();
      });
      sendResponse();
      return true;
    };
    chrome.runtime.onMessage.addListener(this.chromeMessageListener);

    // Les libellés des touches dépendent de l'OS (⌥ / ⇧ sur macOS, Alt / Maj ailleurs)
    resolvePlatform().then((platform) => {
      this.platform = platform;
      this.updateKeyLabels();
      this.changeDetectorRef.detectChanges();
    });
    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      this.updateKeyLabels();
      this.changeDetectorRef.detectChanges();
    });

    chrome.storage.local.get(['uiRecordActivated', 'tuelloKeyboardShortcut'], (results: Record<string, any>) => {
      if (results['uiRecordActivated']) {
        this.spyActif = true;
        // on previent background qui va prevenir contentscript qu'on a démarré le recording.
        // reset: false car l'enregistrement est déjà en cours : le panneau vient juste
        // d'être rouvert, il ne faut pas repartir d'un record vide.
        chrome.runtime.sendMessage(
          {
            action: 'START_UI_RECORDER',
            value: true,
            reset: false
          },
          () => {}
        );
      } else {
        this.spyActif = false;
      }

      if (results['tuelloKeyboardShortcut']) {
        this.screenshot = results['tuelloKeyboardShortcut']?.screenshot?.key || 'S';
        this.captureImage = results['tuelloKeyboardShortcut']?.captureImage?.key || 'I';
        this.comment = results['tuelloKeyboardShortcut']?.comment?.key || 'C';
      }
      this.changeDetectorRef.detectChanges();
    });

    this.scenariosSubscription = this.scenarioStorageService.scenarios$.subscribe((scenarios) => {
      this.scenarios = scenarios;
      this.changeDetectorRef.detectChanges();
    });
    this.scenarioStorageService.load();

    this.recorderHistoryService.loadUiRecordFromLocalStorage().then(() => {
      this.actions = this.recorderHistoryService.record ? this.recorderHistoryService.record.actions : null;
      this.changeDetectorRef.detectChanges();
    });
  }

  startRecording() {
    if (this.actions && this.actions.length > 0) {
      const dialogRef = this.dialog.open(RecordDialogComponent);

      dialogRef
        .afterClosed()
        .pipe(take(1))
        .subscribe(async (result) => {
          const append = result === 'add';
          if (!append) {
            this.actions = [];
            this.jsonContent = '';
            // Attendre que la suppression soit terminée avant de démarrer
            await this.recorderHistoryService.deleteAll();
          }
          this.spyActif = true;
          this.chromeExtentionUtilsService.toggle();
          // append : le background doit reprendre le record existant, pas le réinitialiser
          this.recorderHistoryService.startRecording(append);
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
    chrome.runtime.sendMessage(
      {
        action: 'updateIcon',
        value: 'tuello-32x32.png'
      },
      () => {}
    );

    // on previent background qui va prevenir contentscript qu'on a stopé le recording
    chrome.runtime.sendMessage(
      {
        action: 'START_UI_RECORDER',
        value: false
      },
      () => {}
    );
    if (this.recorderHistoryService.record) {
      this.actions = this.recorderHistoryService.record.actions;
      this.jsonContent = JSON.stringify(this.recorderHistoryService.record);
    }
  }

  async deleteRecords() {
    this.playerService.comparisonResults = null;
    this.actions = [];
    this.jsonContent = '';
    await this.recorderHistoryService.deleteAll();
    this.changeDetectorRef.detectChanges();
  }

  /**
   * Sauvegarde l'enregistrement courant en tant que scénario nommé, réutilisable
   * depuis la mosaïque.
   */
  saveScenario() {
    const record = this.recorderHistoryService.record;
    if (!record || !this.actions?.length) {
      return;
    }
    const data: SaveScenarioDialogData = { existingNames: this.scenarios.map((s) => s.name) };
    this.dialog
      .open(SaveScenarioDialogComponent, { data })
      .afterClosed()
      .pipe(take(1))
      .subscribe(async (name: string) => {
        if (!name) {
          return;
        }
        // Le record en mémoire peut être en retard sur les modifications faites
        // dans la liste (drag & drop, suppressions) : on repart des actions affichées.
        record.actions = this.actions;
        await this.scenarioStorageService.saveFromRecord(name, record);
        this.snackBar.open(this.translate.instant('mmn.spy-http.scenario.saved', { name }), null, { duration: 2000 });
      });
  }

  /** Charge un scénario dans l'éditeur, en remplacement de l'enregistrement courant */
  loadScenario(scenario: Scenario) {
    this.playerService.comparisonResults = null;
    this.recorderHistoryService.importScenario(scenario.actions, scenario.windowSize);
    this.actions = this.recorderHistoryService.record.actions;
    this.jsonContent = JSON.stringify(this.recorderHistoryService.record);
    this.tabGrp.selectedIndex = 0;
    this.changeDetectorRef.detectChanges();
  }

  renameScenario(scenario: Scenario) {
    const data: SaveScenarioDialogData = {
      name: scenario.name,
      existingNames: this.scenarios.map((s) => s.name),
      rename: true
    };
    this.dialog
      .open(SaveScenarioDialogComponent, { data })
      .afterClosed()
      .pipe(take(1))
      .subscribe((name: string) => {
        if (name && name !== scenario.name) {
          this.scenarioStorageService.rename(scenario.id, name);
        }
      });
  }

  async deleteScenario(scenario: Scenario) {
    await this.scenarioStorageService.delete(scenario.id);
    // Les sites de la mosaïque qui pointaient dessus doivent perdre l'association
    await this.mosaicStorageService.removeScenarioReferences(scenario.id);
  }

  formatScenarioDate(timestamp: number): string {
    return formatDate(new Date(timestamp));
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
    chrome.runtime.sendMessage(
      {
        action: 'PLAY_USER_ACTION_INIT'
      },
      () => {}
    );

    chrome.runtime.sendMessage(
      {
        action: 'updateIcon',
        value: 'tuello-play-32x32.png'
      },
      () => {}
    );

    // Mock http
    chrome.runtime.sendMessage(
      {
        action: 'MOCK_HTTP_USER_ACTION',
        value: true,
        data: this.recorderHistoryService.record?.httpRecords
      },
      () => {}
    );

    // on cache l'extension
    this.chromeExtentionUtilsService.hide();

    // on retaille l'écran à la meme taille que celle de l'enregistrement

    chrome.windows.getCurrent((window) => {
      const windowSize = this.recorderHistoryService.record?.windowSize;
      // Utiliser les dimensions actuelles si windowSize n'est pas défini
      let updateInfo = {
        width: windowSize?.width ?? window.width,
        height: windowSize?.height ?? window.height,
        top: windowSize?.top ?? window.top,
        left: windowSize?.left ?? window.left
      };
      (((updateInfo as any).state = 'normal'), chrome.windows.update(window.id, updateInfo, () => this.launchActions()));
    });
  }

  private launchActions() {
    // const hasScreenshot = this.actions.find(action => action.actionType === 'SCREENSHOT');
    chrome.runtime.sendMessage(
      {
        action: 'PLAY_USER_ACTIONS',
        value: this.actions
      },
      () => {}
    );
  }

  public onChange(fileList: any): void {
    const file = fileList.target.files[0];
    const fileReader: FileReader = new FileReader();
    fileReader.onloadend = (x) => {
      this.jsonContent = fileReader.result as string;
      this.snackBar.open(this.translate.instant('mmn.spy-http.import.message'), this.translate.instant('mmn.spy-http.import.success.action'), { duration: 2000 });
      this.recorderHistoryService.importJson(this.jsonContent);
      this.actions = this.recorderHistoryService.record.actions;
      this.tabGrp.selectedIndex = 0;
    };
    fileReader.onerror = (event) => {
      this.snackBar.open(this.translate.instant('mmn.spy-http.import.message'), this.translate.instant('mmn.spy-http.import.error.action'), { duration: 2000 });
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
    chrome.runtime.sendMessage(
      {
        action: 'VIEW_CLICK_ACTION',
        value: this.actions[indexAction].userAction
      },
      () => {}
    );
  }

  /**
   *
   * @param index permet de passer le delay à 1ms sur l'action
   */
  decreaseDelayAction(index: number) {
    if (index >= 0) {
      if (this.actions[index]) {
        this.actions[index].delay = 10;
      }
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
    this.scenariosSubscription?.unsubscribe();
    this.langChangeSubscription?.unsubscribe();
    // Suppression du listener Chrome pour éviter les fuites mémoire
    if (this.chromeMessageListener) {
      chrome.runtime.onMessage.removeListener(this.chromeMessageListener);
    }
    chrome.storage.local.set({ tuelloKeyboardShortcut: this.buildKeyboardShortcut() });
  }

  /**
   * Recalcule les libellés des touches de modification : symboles Apple sur macOS,
   * libellés traduits (Alt / Maj / Shift) sur les autres plateformes.
   */
  private updateKeyLabels() {
    const isMac = this.platform === 'mac';
    this.translate
      .get(['mmn.spy-http.tabs.shortcuts.key.alt', 'mmn.spy-http.tabs.shortcuts.key.shift', `mmn.spy-http.tabs.shortcuts.platform.${this.platform}`])
      .pipe(take(1))
      .subscribe((labels) => {
        const altTranslation = labels['mmn.spy-http.tabs.shortcuts.key.alt'];
        const shiftTranslation = labels['mmn.spy-http.tabs.shortcuts.key.shift'];

        this.altLabel = isMac ? MAC_MODIFIER_LABELS.alt : altTranslation;
        this.shiftLabel = isMac ? MAC_MODIFIER_LABELS.shift : shiftTranslation;
        this.altTooltip = isMac ? MAC_MODIFIER_TITLES.alt : altTranslation;
        this.shiftTooltip = isMac ? MAC_MODIFIER_TITLES.shift : shiftTranslation;
        this.platformHint = labels[`mmn.spy-http.tabs.shortcuts.platform.${this.platform}`];
        this.changeDetectorRef.detectChanges();
      });
  }

  /**
   * Les raccourcis sont comparés à `KeyboardEvent.code` ("KeyS"), qui n'existe que
   * pour la lettre en majuscule : on normalise la saisie avant de la stocker.
   */
  private buildKeyboardShortcut() {
    const normalize = (key: string) => (key || '').toUpperCase();
    return {
      screenshot: { key: normalize(this.screenshot), code: getKeyCode(normalize(this.screenshot)) },
      captureImage: { key: normalize(this.captureImage), code: getKeyCode(normalize(this.captureImage)) },
      comment: { key: normalize(this.comment), code: getKeyCode(normalize(this.comment)) }
    };
  }

  keyboardShortcutChange($event) {
    chrome.storage.local.set({ tuelloKeyboardShortcut: this.buildKeyboardShortcut() }, () => {
      // les menus contextuels affichent les raccourcis : on les resynchronise
      chrome.runtime.sendMessage({ action: 'UPDATE_MENU' }, () => chrome.runtime.lastError);
    });
  }

  private saveActionsOnLocalStorage() {
    if (!this.recorderHistoryService.record) {
      return;
    }
    this.recorderHistoryService.record.actions = this.actions;
    this.recorderHistoryService.saveUiRecordToLocalStorage();
  }
}
