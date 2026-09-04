import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { ScenarioStorageService } from '../../core/scenarios/scenario-storage.service';
import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
import { MosaicLauncherService } from '../services/mosaic-launcher.service';
import { MosaicScreenshotService } from '../services/mosaic-screenshot.service';

@Component({
  selector: 'mmn-mosaic-tile',
  templateUrl: './mosaic-tile.component.html',
  styleUrls: ['./mosaic-tile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule, MatProgressSpinnerModule, TranslatePipe]
})
export class MosaicTileComponent implements OnInit {
  @Input() item: MosaicCategory | MosaicUrl;
  @Input() type: 'category' | 'url';
  @Input() editable = true;

  @Output() tileClick = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();
  @Output() capture = new EventEmitter<void>();

  screenshot: string | null = null;
  capturing = false;
  faviconUrl = '';
  /** Nom du scénario associé : null si aucun, ou si le scénario a été supprimé */
  scenarioName: string | null = null;

  private screenshotService = inject(MosaicScreenshotService);
  private scenarioStorageService = inject(ScenarioStorageService);
  private launcherService = inject(MosaicLauncherService);
  private cdr = inject(ChangeDetectorRef);

  get asUrl(): MosaicUrl {
    return this.item as MosaicUrl;
  }

  get asCategory(): MosaicCategory {
    return this.item as MosaicCategory;
  }

  get urlCount(): number {
    return this.type === 'category' ? (this.item as MosaicCategory).urls.length : 0;
  }

  ngOnInit() {
    if (this.type === 'url') {
      const url = this.asUrl.url;
      try {
        const domain = new URL(url).hostname;
        this.faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      } catch {}
      this.loadScreenshot();
      this.loadScenarioName();
    }
  }

  private async loadScenarioName() {
    if (!this.asUrl.scenarioId) {
      return;
    }
    // load() met la liste en cache : une seule lecture du storage pour toute la grille
    await this.scenarioStorageService.load();
    this.scenarioName = this.scenarioStorageService.getName(this.asUrl.scenarioId);
    this.cdr.detectChanges();
  }

  private async loadScreenshot() {
    this.screenshot = await this.screenshotService.getScreenshot(this.asUrl.id);
    this.cdr.detectChanges();
  }

  async onCapture() {
    this.capturing = true;
    this.cdr.detectChanges();
    await this.screenshotService.openAndCapture(this.asUrl.url, this.asUrl.id);
    this.screenshot = await this.screenshotService.getScreenshot(this.asUrl.id);
    this.capturing = false;
    this.cdr.detectChanges();
    this.capture.emit();
  }

  onTileClick() {
    if (this.type === 'url') {
      this.launcherService.open(this.asUrl);
    } else {
      this.tileClick.emit();
    }
  }
}
