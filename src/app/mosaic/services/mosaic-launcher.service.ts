import { Injectable } from '@angular/core';
import { MosaicUrl } from '../models/mosaic.models';

@Injectable({ providedIn: 'root' })
export class MosaicLauncherService {
  /**
   * Ouvre le site d'une tuile. Si un scénario lui est associé, le background
   * enchaîne le rejeu des actions une fois la page chargée.
   */
  open(url: MosaicUrl): void {
    if (url.scenarioId) {
      chrome.runtime.sendMessage(
        {
          action: 'MOSAIC_PLAY_SCENARIO',
          url: url.url,
          scenarioId: url.scenarioId
        },
        () => chrome.runtime.lastError
      );
      return;
    }
    chrome.tabs.create({ url: url.url });
  }
}
