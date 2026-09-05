import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, ElementRef, inject, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { ScenarioStorageService } from '../../core/scenarios/scenario-storage.service';
import { MosaicCategory, MosaicUrl } from '../models/mosaic.models';
import { MosaicLauncherService } from '../services/mosaic-launcher.service';
import { MosaicNavigationService } from '../services/mosaic-navigation.service';
import { MosaicScreenshotService } from '../services/mosaic-screenshot.service';
import { faviconFor, splitMatches, TextPart } from '../utils/mosaic-text';

export interface SearchResultItem {
  url: MosaicUrl;
  categoryName: string | null;
  categoryId: string | null;
  faviconUrl: string;
  screenshot: string | null;
  titleParts: TextPart[];
  urlParts: TextPart[];
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
export class MosaicSearchResultsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() query = '';
  @Input() categories: MosaicCategory[] = [];
  @Input() rootUrls: MosaicUrl[] = [];

  results: SearchResultItem[] = [];

  private screenshotService = inject(MosaicScreenshotService);
  private scenarioStorageService = inject(ScenarioStorageService);
  private launcherService = inject(MosaicLauncherService);
  private navigationService = inject(MosaicNavigationService);
  private host = inject(ElementRef<HTMLElement>);
  private cdr = inject(ChangeDetectorRef);
  private activateSub?: { unsubscribe(): void };

  readonly activeIndex = this.navigationService.activeIndex;

  constructor() {
    // Le template lit activeIndex() : la mise en surbrillance est prise en charge
    // par le signal. L'effet ne sert qu'au défilement, différé d'une frame pour
    // que la classe active soit déjà posée sur la carte.
    effect(() => {
      const index = this.activeIndex();
      requestAnimationFrame(() => this.scrollIntoView(index));
    });
  }

  ngOnInit(): void {
    this.activateSub = this.navigationService.activate$.subscribe(({ index, background }) => {
      const item = this.results[index];
      if (item) {
        this.launcherService.open(item.url, background);
      }
    });
  }

  ngOnDestroy(): void {
    this.activateSub?.unsubscribe();
    this.navigationService.reset();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.buildResults();
  }

  private scrollIntoView(index: number): void {
    if (index < 0) {
      return;
    }
    this.host.nativeElement.querySelector(`[data-nav-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  selectResult(index: number): void {
    this.navigationService.setActive(index);
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

    this.results = filtered.map(
      (it) =>
        ({
          ...it,
          faviconUrl: faviconFor(it.url.url),
          screenshot: null,
          titleParts: splitMatches(it.url.title ?? '', q),
          urlParts: splitMatches(it.url.url ?? '', q)
        }) as SearchResultItem
    );

    this.navigationService.setCount(this.results.length);
    // Nouvelle recherche : le curseur repart à zéro, l'index précédent désignait
    // un autre site.
    this.navigationService.clearActive();

    this.loadScreenshots();
  }

  private async loadScreenshots(): Promise<void> {
    await this.scenarioStorageService.load();
    for (const r of this.results) {
      const shot = await this.screenshotService.getScreenshot(r.url.id);
      if (shot) {
        r.screenshot = shot;
      }
    }
    this.cdr.detectChanges();
  }

  /** Nom du scénario associé, ou null si aucun (ou scénario supprimé) */
  scenarioName(item: SearchResultItem): string | null {
    return item.url.scenarioId ? this.scenarioStorageService.getName(item.url.scenarioId) : null;
  }

  openUrl(item: SearchResultItem, background = false): void {
    this.launcherService.open(item.url, background);
  }

  trackById(_i: number, item: SearchResultItem): string {
    return item.url.id + (item.categoryId ?? '');
  }
}
