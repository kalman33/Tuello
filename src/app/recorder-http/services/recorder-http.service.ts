import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Permet de stocker les flux json de tous les services
 */
@Injectable({
  providedIn: 'root',
})
export class RecorderHttpService {
  private mmaRecordsSubject = new Subject();

  constructor() {}

  public getJsonRecords() {
    chrome.storage.local.get(['mmaRecords'], results => {
      return results['mmaRecords'];
    });
  }

  saveToLocalStorage(records) {
    chrome.storage.local.set({ mmaRecords: records });
  }

  reset() {
    chrome.storage.local.remove(['mmaRecords']);
  }


  getMmaRecords(){
    return this.mmaRecordsSubject.asObservable();
  }

  setMmaRecords(mmaRecords: any) {
    this.mmaRecordsSubject.next(mmaRecords);
  }



}
