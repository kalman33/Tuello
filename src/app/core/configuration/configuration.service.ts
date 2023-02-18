import {Injectable} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class ConfigurationService {

  constructor(private translate: TranslateService) { }

  init(): Promise<any> {
   this.translate.setDefaultLang('en');
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['language'], results => {
        if (results['language']) {
          this.translate.use(results['language']);
        }
        resolve('success');
      });
    });
  }

}


