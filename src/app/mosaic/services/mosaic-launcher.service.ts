import { Injectable } from '@angular/core';
import { MosaicUrl } from '../models/mosaic.models';

@Injectable({ providedIn: 'root' })
export class MosaicLauncherService {
  /**
   * Ouvre le site d'une tuile. Si un scénario lui est associé, le background
   * enchaîne le rejeu des actions dans cet onglet une fois la page chargée.
   *
   * L'onglet est toujours ouvert ici, et nulle part ailleurs : quand c'était le
   * background qui l'ouvrait, la mosaïque devait l'ouvrir elle-même en secours
   * faute de réponse, et il suffisait qu'un autre contexte d'extension (l'onglet
   * Tuello, dont les listeners répondent à tout message) réponde avant le
   * background pour que ce secours ouvre un second onglet, sans scénario.
   *
   * `background` (Ctrl/Cmd+Entrée) est ignoré quand un scénario est associé :
   * le rejeu pilote l'onglet, il doit être au premier plan.
   */
  open(url: MosaicUrl, background = false): void {
    const scenarioId = url.scenarioId;
    if (!scenarioId) {
      chrome.tabs.create({ url: url.url, active: !background });
      return;
    }

    chrome.tabs.create({ url: url.url, active: true }, (tab) => {
      // La navigation demandée par la tuile ne dépend jamais du rejeu : si
      // l'onglet n'a pas pu être créé, il n'y a rien à piloter.
      if (chrome.runtime.lastError || tab?.id === undefined) {
        return;
      }
      chrome.runtime.sendMessage({ action: 'MOSAIC_PLAY_SCENARIO', tabId: tab.id, scenarioId }, () => {
        // Service worker endormi ou canal fermé par un autre contexte : le site
        // reste ouvert, seul le rejeu est perdu. Lire lastError évite qu'elle
        // remonte en erreur non gérée dans la console.
        void chrome.runtime.lastError;
      });
    });
  }
}
