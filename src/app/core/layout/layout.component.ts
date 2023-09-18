import { MediaMatcher } from '@angular/cdk/layout';
import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { fadeInAnimation } from '../animations/fadeInAnimation';
import { routeAnimations } from '../animations/route.animations';
import { slideInMenuAnimation } from '../animations/slideInMenuAnimation';
import { ChromeExtentionUtilsService } from '../utils/chrome-extention-utils.service';

@Component({
  selector: 'mmn-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'],
  encapsulation: ViewEncapsulation.None,
  animations: [routeAnimations, fadeInAnimation, slideInMenuAnimation]
})
export class LayoutComponent implements AfterViewInit {
  isOpen = false;
  activate = true;
  displayTitle = false;
  title: string;

  stateFadeAnimation = 'inactive';
  statesSlideInMenuAnimation = 'inactive';

  constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private media: MediaMatcher,
    public chromeExtentionUtilsService: ChromeExtentionUtilsService,
    private router: Router
  ) {}

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
      e.source.checked = true;
      this.activate = true;
    } else {
      e.source.checked = !this.activate;
      this.activate = !this.activate;
    }
  }
}
