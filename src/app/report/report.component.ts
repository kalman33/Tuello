import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { PlayerService } from '../spy-http/services/player.service';
import { RecorderHistoryService } from '../spy-http/services/recorder-history.service';
import { ReportMetadataDialogComponent } from './metadata-dialog/report-metadata-dialog.component';
import { HtmlReportService, ReportHighlight } from './services/html-report.service';

@Component({
  selector: 'mmn-report',
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlexModule, ExtendedModule, MatButton, MatIconButton, MatIcon, TranslatePipe, FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule]
})
export class ReportComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  generating = false;

  /** Donnée à mettre en évidence dans le rapport (voir `ReportHighlight`), saisie ici avant
   * génération : la valeur est figée dans le rapport HTML, pas de recherche interactive dedans. */
  highlightSource: ReportHighlight['source'] = 'response';
  highlightKey = '';

  /** Noms de headers de requête que l'application ne peut jamais poser elle-même (spec Fetch,
   * "forbidden request-header name") : le navigateur les gère au niveau réseau et masque leur
   * valeur à tout JS, y compris aux hooks XHR/fetch de httpmanager.ts qui alimentent
   * `requestHeaders`. Choisir l'un d'eux en mise en évidence ne trouvera donc jamais rien. */
  private static readonly FORBIDDEN_REQUEST_HEADERS = new Set([
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'cookie2',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'referer',
    'set-cookie',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'via'
  ]);

  constructor(
    public recorderHistoryService: RecorderHistoryService,
    public playerService: PlayerService,
    private htmlReportService: HtmlReportService,
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private changeDetectorRef: ChangeDetectorRef,
    private router: Router,
    private dialog: MatDialog
  ) {}

  async ngOnInit(): Promise<void> {
    // Le panneau Spy arrête d'écouter les mises à jour (UI_RECORD_CHANGED) dès qu'on le quitte
    // (listener retiré dans son ngOnDestroy). Une capture qui se termine après avoir navigué
    // ici ne met donc jamais à jour la copie en mémoire du service — on relit depuis le storage
    // à chaque arrivée sur cette page pour refléter l'état réellement persisté.
    await this.recorderHistoryService.loadUiRecordFromLocalStorage();

    // Mémorisé d'une session à l'autre (comme darkMode/language, voir SettingsComponent) : on
    // ne veut pas ressaisir la même donnée à chaque génération de rapport.
    chrome.storage.local.get(['reportHighlightSource', 'reportHighlightKey'], (results) => {
      if (results['reportHighlightSource']) {
        this.highlightSource = results['reportHighlightSource'] as ReportHighlight['source'];
      }
      if (results['reportHighlightKey']) {
        this.highlightKey = results['reportHighlightKey'] as string;
      }
      this.changeDetectorRef.detectChanges();
    });

    this.changeDetectorRef.detectChanges();
  }

  onHighlightSourceChange(value: ReportHighlight['source']): void {
    this.highlightSource = value;
    chrome.storage.local.set({ reportHighlightSource: value });
  }

  onHighlightKeyChange(value: string): void {
    this.highlightKey = value;
    chrome.storage.local.set({ reportHighlightKey: value });
  }

  /** `true` quand la clé saisie ne pourra jamais être trouvée dans `requestHeaders` (voir
   * FORBIDDEN_REQUEST_HEADERS) : affiche l'avertissement sous le champ plutôt que de laisser
   * l'utilisateur découvrir après génération que la mise en évidence est restée vide. */
  get highlightKeyForbidden(): boolean {
    if (this.highlightSource !== 'requestHeader') {
      return false;
    }
    const key = this.highlightKey.trim().toLowerCase();
    if (!key) {
      return false;
    }
    return ReportComponent.FORBIDDEN_REQUEST_HEADERS.has(key) || key.startsWith('proxy-') || key.startsWith('sec-');
  }

  get hasData(): boolean {
    return !!this.recorderHistoryService.record?.actions?.length;
  }

  get httpErrorCount(): number {
    return (this.recorderHistoryService.record?.httpRecords || []).filter((http) => Number(http.httpCode) >= 400).length;
  }

  get consoleLogCount(): number {
    return this.recorderHistoryService.record?.consoleLogs?.length ?? 0;
  }

  get consoleErrorCount(): number {
    return (this.recorderHistoryService.record?.consoleLogs || []).filter((entry) => entry.level === 'error').length;
  }

  get comparisonCount(): number {
    return this.playerService.comparisonResults?.length ?? 0;
  }

  async generateReport(): Promise<void> {
    // Demandé avant la génération (plutôt qu'après) pour pouvoir annuler sans produire de
    // fichier : fermer le dialogue sans valider (croix, clic hors modal, "Annuler") renvoie
    // `undefined`, qui abandonne la génération.
    const metadata = await firstValueFrom(this.dialog.open(ReportMetadataDialogComponent, { width: '420px' }).afterClosed());
    if (!metadata) {
      return;
    }

    // Même raison qu'en ngOnInit : s'assurer qu'on exporte bien le dernier état persisté,
    // pas une copie en mémoire potentiellement figée avant la fin d'une capture asynchrone.
    await this.recorderHistoryService.loadUiRecordFromLocalStorage();
    if (!this.recorderHistoryService.record) {
      return;
    }
    this.generating = true;
    this.changeDetectorRef.detectChanges();
    const highlight: ReportHighlight = { source: this.highlightSource, key: this.highlightKey };
    try {
      await this.htmlReportService.generateReport(this.recorderHistoryService.record, this.playerService.comparisonResults, metadata, highlight);
      this.snackBar.open(this.translate.instant('mmn.report.generate.success'), '', { duration: 2000 });
    } finally {
      this.generating = false;
      this.changeDetectorRef.detectChanges();
    }
  }

  back(): void {
    this.router.navigate(['/spy'], { skipLocationChange: true });
  }
}
