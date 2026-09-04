import { Injectable } from '@angular/core';
import { MosaicUrl } from '../models/mosaic.models';

@Injectable({ providedIn: 'root' })
export class MosaicLauncherService {
  /**
   * Ouvre le site d'une tuile. Si un scénario lui est associé, le background
   * enchaîne le rejeu des actions une fois la page chargée.
   */
  open(url: MosaicUrl): void {
    if (!url.scenarioId) {
      chrome.tabs.create({ url: url.url });
      return;
    }

    chrome.runtime.sendMessage(
      {
        action: 'MOSAIC_PLAY_SCENARIO',
        url: url.url,
        scenarioId: url.scenarioId
      },
      (response) => {
        // Service worker endormi/indisponible ou ouverture refusée : le site est
        // ouvert malgré tout. La navigation demandée par la tuile ne doit jamais
        // dépendre du rejeu du scénario.
        if (chrome.runtime.lastError || !response?.opened) {
          chrome.tabs.create({ url: url.url });
        }
      }
    );
  }
}
