import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
import { MosaicScreenshotService } from '../services/mosaic-screenshot.service';

export interface SearchResultItem {
  url: MosaicUrl;
  categoryName: string | null;
  categoryId: string | null;
  faviconUrl: string;
  screenshot: string | null;
  titleParts: { text: string; match: boolean }[];
  urlParts: { text: string; match: boolean }[];
}

@Component({
  selector: 'mmn-mosaic-search-results',
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatTooltipModule, TranslatePipe],
  animations: [
    trigger('staggerList', [
      transition(':enter', [
        query('.result-card', [style({ opacity: 0, transform: 'translateY(20px) scale(0.96)' }), stagger(35, [animate('0.35s cubic-bezier(0.35, 0, 0.25, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))])], { optional: true })
      ])
    ])
  ]
})
export class MosaicSearchResultsComponent implements OnChanges {
  @Input() query = '';
  @Input() categories: MosaicCategory[] = [];
  @Input() rootUrls: MosaicUrl[] = [];

  results: SearchResultItem[] = [];

  private screenshotService = inject(MosaicScreenshotService);
  private cdr = inject(ChangeDetectorRef);

  ngOnChanges(_changes: SimpleChanges): void {
    this.buildResults();
  }

  private buildResults(): void {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      this.results = [];
      return;
    }

    const all: Omit<SearchResultItem, 'titleParts' | 'urlParts' | 'faviconUrl' | 'screenshot'>[] = [];

    for (const url of this.rootUrls) {
      all.push({ url, categoryName: null, categoryId: null });
    }
    for (const cat of this.categories) {
      for (const url of cat.urls) {
        all.push({ url, categoryName: cat.name, categoryId: cat.id });
      }
    }

    const filtered = all.filter((it) => {
      const t = (it.url.title ?? '').toLowerCase();
      const u = (it.url.url ?? '').toLowerCase();
      const c = (it.categoryName ?? '').toLowerCase();
      return t.includes(q) || u.includes(q) || c.includes(q);
    });

    this.results = filtered.map((it) => {
      let favicon = '';
      try {
        favicon = `https://www.google.com/s2/favicons?domain=${new URL(it.url.url).hostname}&sz=64`;
      } catch {}
      return {
        ...it,
        faviconUrl: favicon,
        screenshot: null,
        titleParts: this.splitMatches(it.url.title ?? '', q),
        urlParts: this.splitMatches(it.url.url ?? '', q)
      } as SearchResultItem;
    });

    this.loadScreenshots();
  }

  private async loadScreenshots(): Promise<void> {
    for (const r of this.results) {
      const shot = await this.screenshotService.getScreenshot(r.url.id);
      if (shot) {
        r.screenshot = shot;
      }
    }
    this.cdr.detectChanges();
  }

  private splitMatches(text: string, q: string): { text: string; match: boolean }[] {
    if (!q || !text) return [{ text, match: false }];
    const parts: { text: string; match: boolean }[] = [];
    const lower = text.toLowerCase();
    let i = 0;
    while (i < text.length) {
      const idx = lower.indexOf(q, i);
      if (idx === -1) {
        parts.push({ text: text.slice(i), match: false });
        break;
      }
      if (idx > i) {
        parts.push({ text: text.slice(i, idx), match: false });
      }
      parts.push({ text: text.slice(idx, idx + q.length), match: true });
      i = idx + q.length;
    }
    return parts;
  }

  openUrl(item: SearchResultItem): void {
    chrome.tabs.create({ url: item.url.url });
  }

  trackById(_i: number, item: SearchResultItem): string {
    return item.url.id + (item.categoryId ?? '');
  }
}
