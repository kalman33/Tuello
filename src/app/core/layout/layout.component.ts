import { MediaMatcher } from '@angular/cdk/layout';
import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { fadeInAnimation } from '../animations/fadeInAnimation';
import { routeAnimations } from '../animations/route.animations';
import { slideInMenuAnimation } from '../animations/slideInMenuAnimation';
import { ChromeExtentionUtilsService } from '../utils/chrome-extention-utils.service';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { RateSupportComponent } from './rate-support/rate-support.component';
import { TranslateModule } from '@ngx-translate/core';
import { MatLine } from '@angular/material/core';
import { MatNavList, MatListItem } from '@angular/material/list';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { NgClass } from '@angular/common';
import { MatToolbar } from '@angular/material/toolbar';

@Component({
    selector: 'mmn-layout',
    templateUrl: './layout.component.html',
    styleUrls: ['./layout.component.scss'],
    encapsulation: ViewEncapsulation.None,
    animations: [routeAnimations, fadeInAnimation, slideInMenuAnimation],
    standalone: true,
    imports: [MatToolbar, NgClass, ExtendedModule, MatSlideToggle, MatIconButton, MatIcon, MatSidenavContainer, MatSidenav, MatNavList, MatListItem, RouterLink, MatLine, MatButton, MatSidenavContent, RouterOutlet, TranslateModule]
})
export class LayoutComponent implements AfterViewInit, OnInit {
  isOpen = false;
  activate = true;
  displayTitle = false;
  title: string;
  // Indice de l'élément sélectionné
  selectedIndex = 0;

  menuLabels: string[] = [];

  stateFadeAnimation = 'inactive';
  statesSlideInMenuAnimation = 'inactive';

  @ViewChild('snav') sidenav: MatSidenav;

  constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private media: MediaMatcher,
    public chromeExtentionUtilsService: ChromeExtentionUtilsService,
    private router: Router,
    private rateSupportSheet: MatBottomSheet
  ) {}

  ngOnInit(): void {
    chrome.storage.local.get(['settings', 'selectedMenu'], results => {
      if (results['settings']) {
        this.menuLabels = results['settings'];
      }
      if (results['selectedMenu']) {
        this.selectedIndex = results['selectedMenu'];
      }
      //this.sidenav.toggle();
      //this.isOpen = !this.isOpen;
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

  /** une fois que l'animation est terminée */
  animationDone($event) {
    this.displayTitle = true;
    let letterCount = 1;

    const timeOutTitle = setInterval(() => {
      this.title = 'TUELLO'.substring(0, letterCount);
      letterCount++;
      if (letterCount === 7) {
        clearInterval(timeOutTitle);
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
      //this.sidenav.toggle();
      //this.isOpen = !this.isOpen;
    });
  }

  // Fonction pour gérer la sélection d'un élément
  selectMenuItem(index: number): void {
    this.selectedIndex = index;
    chrome.storage.local.set({ selectedMenu : index});
   
  }

  openRateSupport() {
    this.rateSupportSheet.open(RateSupportComponent);
  }
}
