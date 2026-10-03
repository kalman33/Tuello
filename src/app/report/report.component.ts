import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { PlayerService } from '../spy-http/services/player.service';
import { RecorderHistoryService } from '../spy-http/services/recorder-history.service';
import { HtmlReportService } from './services/html-report.service';

@Component({
  selector: 'mmn-report',
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlexModule, ExtendedModule, MatButton, MatIconButton, MatIcon, TranslatePipe]
})
export class ReportComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  generating = false;

  constructor(
    public recorderHistoryService: RecorderHistoryService,
    public playerService: PlayerService,
    private htmlReportService: HtmlReportService,
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private changeDetectorRef: ChangeDetectorRef,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    // Le panneau Spy arrête d'écouter les mises à jour (UI_RECORD_CHANGED) dès qu'on le quitte
    // (listener retiré dans son ngOnDestroy). Une capture qui se termine après avoir navigué
    // ici ne met donc jamais à jour la copie en mémoire du service — on relit depuis le storage
    // à chaque arrivée sur cette page pour refléter l'état réellement persisté.
    await this.recorderHistoryService.loadUiRecordFromLocalStorage();
    this.changeDetectorRef.detectChanges();
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
    // Même raison qu'en ngOnInit : s'assurer qu'on exporte bien le dernier état persisté,
    // pas une copie en mémoire potentiellement figée avant la fin d'une capture asynchrone.
    await this.recorderHistoryService.loadUiRecordFromLocalStorage();
    const screenshotCount = (this.recorderHistoryService.record?.httpRecords || []).filter((h) => h.screenshot).length;
    console.log('[Tuello] ReportComponent.generateReport : record relu depuis le storage,', screenshotCount, 'capture(s) HTTP,', this.recorderHistoryService.record?.httpRecords?.length ?? 0, 'requête(s) au total');
    if (!this.recorderHistoryService.record) {
      return;
    }
    this.generating = true;
    this.changeDetectorRef.detectChanges();
    try {
      await this.htmlReportService.generateReport(this.recorderHistoryService.record, this.playerService.comparisonResults);
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
