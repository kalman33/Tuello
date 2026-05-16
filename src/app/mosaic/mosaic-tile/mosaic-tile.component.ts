import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
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

  private screenshotService = inject(MosaicScreenshotService);
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
    }
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
      chrome.tabs.create({ url: this.asUrl.url });
    } else {
      this.tileClick.emit();
    }
  }
}
