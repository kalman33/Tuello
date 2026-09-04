import { Injectable } from '@angular/core';
import { Action } from '../models/Action';
import { Record } from '../models/Record';
import { WindowSize } from '../models/WindowSize';
import { CompressionService } from '../../core/compression/compression.service';

@Injectable({ providedIn: 'root' })
export class RecorderHistoryService {

  // représente un enregistrement
  public record: Record;

  private lastAction: Action;
  private last: number;

  constructor(private compressionService: CompressionService) {}

  deleteAll(): Promise<void> {
    return new Promise((resolve) => {
      this.record = null;
      this.lastAction = null;
      this.last = undefined;

      // Supprimer du storage local et marquer la suppression
      chrome.storage.local.remove(['uiRecord'], () => {
        // Marquer la suppression dans le storage (survit au redémarrage du service worker)
        chrome.storage.local.set({ uiRecordDeleted: true }, () => {
          // Prévenir le background pour effacer son état interne
          chrome.runtime.sendMessage({
            action: 'RECORD_USER_ACTION_DELETE'
          }, () => {
            resolve();
          });
        });
      });
    });
  }

  public importJson(json: string) {
    const data = JSON.parse(json);
    this.record = new Record(data.windowSize);
    this.record.actions = data.actions;
    this.record.httpRecords = data.httpRecords;
    this.saveUiRecordToLocalStorage();
  }

  /**
   * Charge un scénario (actions seules) dans l'enregistrement courant.
   * Les flux http du record précédent sont abandonnés : un scénario n'en embarque pas.
   */
  public importScenario(actions: Action[], windowSize?: WindowSize) {
    this.record = new Record(windowSize);
    this.record.actions = actions.map((action) => ({ ...action }));
    this.saveUiRecordToLocalStorage();
  }

  public async loadUiRecordFromLocalStorage() {
    const record = await this.compressionService.loadCompressed<Record>('uiRecord');
    if (record) {
      this.record = record;
    }
  }

  public saveUiRecordToLocalStorage() {
    this.compressionService.saveCompressed('uiRecord', this.record);

    // Le background garde une copie du record en mémoire pendant l'enregistrement :
    // sans cette synchronisation, il réécrit sa version obsolète à l'action suivante
    // et les modifications faites ici sont perdues.
    chrome.runtime.sendMessage(
      {
        action: 'UI_RECORD_UPDATED',
        value: this.record
      },
      () => chrome.runtime.lastError
    );
  }

  /**
   * @param append true pour reprendre l'enregistrement existant au lieu d'en démarrer un nouveau
   */
  public startRecording(append = false) {
    // on stock l'état dans le storage
    chrome.storage.local.set({ uiRecordActivated: true });

    // modif de l'icone du plugin pour le mettre en mode record
    chrome.runtime.sendMessage({
      action: 'updateIcon',
      value: 'tuello-rec-32x32.png',
    }, () => {});

    // on previent background qui va prevenir contentscript qu'on a démarré le recording
    chrome.runtime.sendMessage({
      action: 'START_UI_RECORDER',
      value: true,
      reset: !append,
    }, () => {});
  }
}
