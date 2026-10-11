import {Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import * as enMessages from '../../../assets/i18n/en.json';
import * as frMessages from '../../../assets/i18n/fr.json';

@Injectable({ providedIn: 'root' })
export class ConfigurationService {

  constructor(private translate: TranslateService) { }

  init(): Promise<any> {
    this.translate.setDefaultLang('en');
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['language', 'messages'], (results: Record<string, any>) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (results['language']) {
          this.translate.use(results['language']);
          this.syncMessages(results['language'], results['messages']);
        }
        resolve('success');
      });
    });
  }

  /**
   * Les traductions lues par le service worker (menus contextuels, notifications) sont une copie
   * stockée au changement de langue : après une mise à jour de Tuello, cette copie ne contient pas
   * les nouvelles clés. On la remplace si elle diffère de la version embarquée.
   */
  private syncMessages(language: string, stored: unknown) {
    const messages = language === 'fr' ? frMessages : enMessages;
    if (JSON.stringify(stored) === JSON.stringify(messages)) {
      return;
    }
    chrome.storage.local.set({ messages }, () => {
      chrome.runtime.sendMessage({ action: 'UPDATE_MENU' }, () => chrome.runtime.lastError);
    });
  }

}
