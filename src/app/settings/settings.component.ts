import { Component, ElementRef, OnInit, Renderer2 } from '@angular/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { TranslateService } from '@ngx-translate/core';
import { ThemeService } from '../theme/theme.service';
import * as frMessages from '../../assets/i18n/fr.json';
import * as enMessages from '../../assets/i18n/en.json';


@Component({
  selector: 'mmn-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  darkMode: boolean;
  deepMockLevel = 0;
  mouseCoordinates: boolean;
  desactivate = false;
  languages = [
    { value: 'en', label: 'en' },
    { value: 'fr', label: 'fr' }
  ];

  selectedLanguage;

  constructor(
    private themeService: ThemeService,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    chrome.storage.local.get(['language', 'darkMode', 'deepMockLevel', 'mouseCoordinates'], results => {
      if (results['language']) {
        this.selectedLanguage = results['language'];
      }
      if (results['darkMode']) {
        this.darkMode = results['darkMode'];

        if (this.darkMode) {
          // positionne le mode dark
          this.toggleTheme(this.darkMode);
        }
      }

      if (results['mouseCoordinates']) {
        this.mouseCoordinates = results['mouseCoordinates'];
      }
      if (results['deepMockLevel']) {
        this.deepMockLevel = results['deepMockLevel'];
      }
    });
  }

  /**
   * Permet de basculer de thème
   */
  toggleTheme(darkModevalue: boolean) {
    chrome.storage.local.set({ darkMode: darkModevalue });
    this.themeService.toggleTheme(darkModevalue);
  }

  updateDeepMockLevel(event) {
    chrome.storage.local.set({ deepMockLevel: event.value });
  }

  toggleMouseCoordinatesOption(mouseCoordinatesValue: boolean) {
    chrome.storage.local.set({ mouseCoordinates: mouseCoordinatesValue });
    // on previent background qui va prevenir contentscript qu'on a modifié le mouseCoordinates
    chrome.runtime.sendMessage({
      action: 'MOUSE_COORDINATES',
      value: mouseCoordinatesValue
    }, ()=>{});
  }

  toggleDesactivate(e) {
    if (!this.desactivate) {
      chrome.storage.local.set({ disabled: true });
      // on previent background
      chrome.runtime.sendMessage({
        action: 'updateIcon',
        value: 'tuello-stop-32x32.png'
      }, ()=>{});
      chrome.tabs.getCurrent(tab => {
        chrome.tabs.sendMessage(tab.id, 'toggle', {
          frameId: 0
        }, ()=>{});
      });
      e.source.checked = false;
      this.desactivate = false;
    } else {
      this.desactivate = !this.desactivate;
    }
  }

  onLanguageSelect({ value }) {
    chrome.storage.local.set({ language: value });
    this.translate.use(value);
    if (value === 'fr') {
      chrome.storage.local.set({ messages: frMessages });
    } else {
      chrome.storage.local.set({ messages: enMessages });
    }
    chrome.runtime.sendMessage({
      action: 'UPDATE_MENU'
    }, ()=>{});
  }
}
