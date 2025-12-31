import { AfterViewInit, ChangeDetectionStrategy, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Event, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { GuideTourService } from './core/guide-tour/guide-tour.service';
import { ChromeExtentionUtilsService } from './core/utils/chrome-extention-utils.service';
import { PlayerService } from './spy-http/services/player.service';
import { RecorderHistoryService } from './spy-http/services/recorder-history.service';
import { ThemeService } from './theme/theme.service';
import { TrackService } from './track/services/track.service';

@Component({
    selector: 'mmn-root',
    template: `
    <router-outlet></router-outlet>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet]
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  title = 'Tuello';

  actionsListener;
  private routerSubscription: Subscription;

  constructor(
    private themeService: ThemeService,
    private chromeExtentionUtilsService: ChromeExtentionUtilsService,
    private recorderHistoryService: RecorderHistoryService,
    private playerService: PlayerService,
    private router: Router,
    private ngZone: NgZone,
    private trackService: TrackService,
    private guideTourService: GuideTourService
  ) {
    chrome.storage.local.get(['darkMode'], results => {
      if (results['darkMode']) {
        this.themeService.toggleTheme(results['darkMode']);
      }
    });

    this.routerSubscription = this.router.events.pipe(
      filter((event: Event) => event instanceof NavigationEnd)
    ).subscribe(event => {
      chrome.storage.local.set({ tuelloCurrentRoute: (event as NavigationEnd).url });
    });

    this.actionsListener = (message, sender, sendResponse) => {
      switch (message.action) {
        case 'VIEW_IMAGE_CLOSED':
          this.chromeExtentionUtilsService.show();
          this.chromeExtentionUtilsService.imageViewerOpened = false;
          break;
        case 'SHOW_COMPARISON_RESULTS':

          this.playerService.comparisonResults = message.value;
          this.ngZone.run(() => {
            this.router.navigateByUrl('/spy/results', { skipLocationChange: true });
          });
          break;
        case 'ACTIONS_PAUSED':
          this.playerService.pausedActionNumber = message.value;
          this.ngZone.run(() => {
            this.router.navigateByUrl('/spy', { skipLocationChange: true });
          });
          break;
        case 'TRACK_VIEW':
          this.chromeExtentionUtilsService.show();
          this.trackService.currentHrefLocation = message.value.currentHrefLocation
          this.ngZone.run(() => {
            this.router.navigate(['/track'], { skipLocationChange: false, queryParams: { trackId: message.value?.trackId } });
          });
          break;
      }
      sendResponse();
      return true;
    };

    // on recpuère l'état des enregistrements de l'ui recorder
    this.recorderHistoryService.loadUiRecordFromLocalStorage();

    // on affiche l'app si elle est cachée
    // this.chromeExtentionUtilsService.show();

    // gestion de la fermeture de l'image viewer
    chrome.runtime.onMessage.addListener(this.actionsListener);

    // on relance la route
    chrome.storage.local.get(['tuelloCurrentRoute'], results => {
      if (results['tuelloCurrentRoute']) {
        this.ngZone.run(() => {
          this.router.navigateByUrl(results['tuelloCurrentRoute'], { skipLocationChange: true });
        });
      }
      // Initialisation du guide apres le chargement de la route
      this.initGuide();
    });
  }

  /**
   * Initialise le guide interactif pour les nouveaux utilisateurs
   */
  private async initGuide(): Promise<void> {
    await this.guideTourService.init();
    const isFirstLaunch = await this.guideTourService.checkFirstLaunch();
    if (isFirstLaunch) {
      // Attendre un court instant pour que l'UI soit prete
      setTimeout(() => {
        this.ngZone.run(() => {
          this.guideTourService.showWelcomeDialog();
        });
      }, 500);
    }
  }

  ngOnInit(): void {
    const that = this;

    Object.defineProperty(window, 'devtools-page', {
      configurable: true,
      set(value) {
        that.chromeExtentionUtilsService.devtoolsOpened = value;
        Object.defineProperty(window, 'devtools-page', { value });
      }
    });
  }

  ngAfterViewInit() {
    this.chromeExtentionUtilsService.devtoolsOpened = window['devtools-page'];
  }

  ngOnDestroy(): void {
    chrome.runtime.onMessage.removeListener(this.actionsListener);
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }
}
