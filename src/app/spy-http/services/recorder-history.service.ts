import { Injectable } from '@angular/core';
import { Action } from '../models/Action';
import { Record } from '../models/Record';

@Injectable({ providedIn: 'root' })
export class RecorderHistoryService {

  // représente un enregistrement
  public record: Record;

  private lastAction: Action;
  private last: number;

  deleteAll() {
    this.record = null;
    this.lastAction = null;
    this.last = undefined;
    // on previent background pour effacer le record en cours
    chrome.runtime.sendMessage({
      action: 'RECORD_USER_ACTION_DELETE'
    }, ()=>{});

  }

  public importJson(json: string) {
    const data = JSON.parse(json);
    this.record = new Record(data.windowSize);
    this.record.actions = data.actions;
    this.record.httpRecords = data.httpRecords;
    this.saveUiRecordToLocalStorage();
  }

  public loadUiRecordFromLocalStorage() {
    chrome.storage.local.get(['uiRecord'], results => {
      if (results['uiRecord']) {
        this.record = results['uiRecord'];
      }
    });
  }

  public saveUiRecordToLocalStorage() {
    chrome.storage.local.set({ uiRecord: this.record });
  }

  public startRecording(){
    // on stock l'état dans le storage
    chrome.storage.local.set({ uiRecordActivated: true });

    // modif de l'icone du plugin pour le mettre en mode record
    chrome.runtime.sendMessage({
      action: 'updateIcon',
      value: 'tuello-rec-32x32.png',
    }, ()=>{});

    // on previent background qui va prevenir contentscript qu'on a démarré le recording
    chrome.runtime.sendMessage({
      action: 'START_UI_RECORDER',
      value: true,
    }, ()=>{});
  }
}
