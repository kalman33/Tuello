import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Permet de stocker les flux json de tous les services
 */
@Injectable({
  providedIn: 'root',
})
export class RecorderHttpService {
  private tuelloRecordsSubject = new Subject();

  constructor() {}

  public getJsonRecords() {
    chrome.storage.local.get(['tuelloRecords'], results => {
      return results['tuelloRecords'];
    });
  }

  saveToLocalStorage(records) {
    chrome.storage.local.set({ tuelloRecords: records });
  }

  reset() {
    chrome.storage.local.remove(['tuelloRecords']);
  }


  getTuelloRecords(){
    return this.tuelloRecordsSubject.asObservable();
  }

  setTuelloRecords(tuelloRecords: any) {
    this.tuelloRecordsSubject.next(tuelloRecords);
  }



}
