import { Component, ElementRef, NgZone, OnInit, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService, TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import * as enMessages from '../../assets/i18n/en.json';
import * as frMessages from '../../assets/i18n/fr.json';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ConfigurationService } from '../core/configuration/configuration.service';
import { formatDate } from '../core/utils/date-utils';
import { ThemeService } from '../theme/theme.service';
import { MatButton } from '@angular/material/button';
import { SettingsMenuComponent } from './menus/settings-menu.component';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { MatOption } from '@angular/material/core';
import { MatSelect } from '@angular/material/select';
import { MatFormField } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { NgClass } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatTabGroup, MatTab, MatTabLabel } from '@angular/material/tabs';
import { FlexModule } from '@ngbracket/ngx-layout/flex';


@Component({
    selector: 'mmn-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    standalone: true,
    imports: [FlexModule, MatTabGroup, MatTab, MatTabLabel, MatIcon, NgClass, ExtendedModule, MatSlideToggle, FormsModule, MatFormField, MatSelect, MatOption, MatSlider, MatSliderThumb, SettingsMenuComponent, MatButton, TranslatePipe, TranslateDirective]
})
export class SettingsComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
  darkMode: boolean;
  deepMockLevel = 0;
  mouseCoordinates: boolean;
  desactivate = false;
  verboseMode: boolean;
  languages = [
    { value: 'en', label: 'en' },
    { value: 'fr', label: 'fr' }
  ];

  @ViewChild('fileInput') fileInput: ElementRef;
  jsonContent;

  selectedLanguage;

  constructor(
    private themeService: ThemeService,
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private configurationService: ConfigurationService,
    private zone: NgZone
  ) { }

  ngOnInit() {
    this.init();
  }

  init() {
    chrome.storage.local.get(['language', 'darkMode', 'deepMockLevel', 'mouseCoordinates', 'verboseMode'], results => {
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

      if (results['verboseMode']) {
        this.verboseMode = results['verboseMode'];
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
    this.deepMockLevel = event.value;
  }

  toggleMouseCoordinatesOption(mouseCoordinatesValue: boolean) {
    chrome.storage.local.set({ mouseCoordinates: mouseCoordinatesValue });
    // on previent background qui va prevenir contentscript qu'on a modifié le mouseCoordinates
    chrome.runtime.sendMessage({
      action: 'MOUSE_COORDINATES',
      value: mouseCoordinatesValue
    }, () => { });
  }

  toggleDesactivate(e) {
    if (!this.desactivate) {
      chrome.storage.local.set({ disabled: true });
      // on previent background
      chrome.runtime.sendMessage({
        action: 'updateIcon',
        value: 'tuello-stop-32x32.png'
      }, () => { });
      chrome.tabs.getCurrent(tab => {
        chrome.tabs.sendMessage(tab.id, 'toggle', {
          frameId: 0
        }, () => { });
      });
      e.source.checked = false;
      this.desactivate = false;
    } else {
      this.desactivate = !this.desactivate;
    }
  }

  toggleVerboseMode(verboseModeValue: boolean) {
    chrome.storage.local.set({ loggerEnabled: verboseModeValue });
    
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
    }, () => { });
  }

  async save() {
    const all = await chrome.storage.local.get();
    const value = formatDate(new Date());
    const txtBlob = new Blob([JSON.stringify(all)], { type: 'text/plain;charset=utf-8' });
    saveAs(txtBlob, `tuello-global.${value}.json`);

  }

  clear() {
    chrome.storage.local.clear();
  }

  public onChange(fileList: any): void {
    const file = fileList.target.files[0];
    const fileReader: FileReader = new FileReader();
    fileReader.onloadend = x => {
      try {

        this.jsonContent = JSON.parse(fileReader.result as string);
        chrome.storage.local.set(this.jsonContent, () => {

          this.init();
          this.configurationService.init();
          this.zone.run(() => {
            this.snackBar.open(
              this.translate.instant('mmn.spy-http.import.message'),
              this.translate.instant('mmn.recorder-http.export.saveAsLib.information.success.action'),
              { duration: 2000 }
            );
          });
        });
      } catch (e) {
        this.snackBar.open(
          this.translate.instant('mmn.settings.import.message'),
          this.translate.instant('mmn.settings.import.error.action'),
          { duration: 1000, verticalPosition: 'bottom' }
        );
      }

    };
    fileReader.onerror = event => {
      this.snackBar.open(
        this.translate.instant('mmn.settings.import.message'),
        this.translate.instant('mmn.settings.import.error.action'),
        { duration: 1000, verticalPosition: 'bottom' }
      );
      fileReader.abort();
    };
    fileReader.readAsText(file);
  }

  selectFile() {
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }


}
