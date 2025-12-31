import { MediaMatcher } from '@angular/cdk/layout';
import { NgClass } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatLine } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatListItem, MatNavList } from '@angular/material/list';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { TranslatePipe } from "@ngx-translate/core";
import { fadeInAnimation } from '../animations/fadeInAnimation';
import { routeAnimations } from '../animations/route.animations';
import { slideInMenuAnimation } from '../animations/slideInMenuAnimation';
import { GuideTourService } from '../guide-tour/guide-tour.service';
import { ChromeExtentionUtilsService } from '../utils/chrome-extention-utils.service';
import { RateSupportComponent } from './rate-support/rate-support.component';

@Component({
    selector: 'mmn-layout',
    templateUrl: './layout.component.html',
    styleUrls: ['./layout.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [routeAnimations, fadeInAnimation, slideInMenuAnimation],
    imports: [MatToolbar, NgClass, ExtendedModule, MatSlideToggle, MatIconButton, MatIcon, MatSidenavContainer, MatSidenav, MatNavList, MatListItem, RouterLink, MatLine, MatButton, MatSidenavContent, RouterOutlet, TranslatePipe, MatTooltip]
})
export class LayoutComponent implements AfterViewInit, OnInit, OnDestroy {
  isOpen = false;
  activate = true;
  displayTitle = false;
  title: string;
  selectedIndex = 0;
  menuLabels: string[] = [];
  stateFadeAnimation = 'inactive';
  statesSlideInMenuAnimation = 'inactive';
  private titleInterval: ReturnType<typeof setInterval> | null = null;

  @ViewChild('snav') sidenav: MatSidenav;

  constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private media: MediaMatcher,
    public chromeExtentionUtilsService: ChromeExtentionUtilsService,
    private router: Router,
    private rateSupportSheet: MatBottomSheet,
    private guideTourService: GuideTourService
  ) {}

  ngOnInit(): void {
    chrome.storage.local.get(['settings', 'selectedMenu'], results => {
      if (results['settings']) {
        this.menuLabels = results['settings'];
      }
      if (results['selectedMenu']) {
        this.selectedIndex = results['selectedMenu'];
      }
      this.changeDetectorRef.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    this.stateFadeAnimation = 'active';
    this.changeDetectorRef.detectChanges();
  }

  /**
   * Permet de fermer le plugin
   */
  close() {
    // this.router.navigate(['/spy/results']);
    chrome.tabs.getCurrent(tab => {
      chrome.tabs.sendMessage(tab.id, 'toggle', {
        frameId: 0
      }, ()=>{});
    });
  }

  animationDone($event) {
    this.displayTitle = true;
    let letterCount = 1;

    this.titleInterval = setInterval(() => {
      this.title = 'TUELLO'.substring(0, letterCount);
      letterCount++;
      this.changeDetectorRef.detectChanges();
      if (letterCount === 7) {
        clearInterval(this.titleInterval);
        this.titleInterval = null;
      }
    }, 100);
  }

  toggleDesactivate(e) {
    if (this.activate) {
      chrome.storage.local.set({ disabled: true });
      // on previent background
      chrome.runtime.sendMessage({
        action: 'updateIcon',
        value: 'tuello-stop-32x32.png'
      }, ()=> {});
      chrome.tabs.getCurrent(tab => {
        chrome.tabs.sendMessage(tab.id, 'toggle', {
          frameId: 0
        }, ()=>{});
      });
      // on previent background
      chrome.runtime.sendMessage({
        action: 'DEACTIVATE',
      }, ()=> {});
      e.source.checked = true;
      this.activate = true;
    } else {
      e.source.checked = !this.activate;
      this.activate = !this.activate;
    }
  }
  
  openSideNav() {
    chrome.storage.local.get(['settings', 'selectedMenu'], results => {
      if (results['settings']) {
        this.menuLabels = results['settings'];
      }
      this.changeDetectorRef.detectChanges();
    });
  }

  ngOnDestroy(): void {
    if (this.titleInterval) {
      clearInterval(this.titleInterval);
    }
  }

  // Fonction pour gérer la sélection d'un élément
  selectMenuItem(index: number): void {
    this.selectedIndex = index;
    chrome.storage.local.set({ selectedMenu : index});
   
  }

  openRateSupport() {
    this.rateSupportSheet.open(RateSupportComponent);
  }

  /**
   * Demarre le tour guide pour la section actuelle
   */
  startHelpTour(): void {
    // Fermer le sidenav
    this.sidenav.close();
    this.isOpen = false;

    // Determiner le tour a lancer en fonction de la route actuelle
    const currentRoute = this.router.url;
    const tourId = this.guideTourService.getTourIdFromRoute(currentRoute);

    if (tourId) {
      this.guideTourService.startTour(tourId);
    }
  }
}
