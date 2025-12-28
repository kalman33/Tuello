import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CompressionService } from '../../core/compression/compression.service';

/**
 * Permet de stocker les flux json de tous les services
 */
@Injectable({
  providedIn: 'root',
})
export class RecorderHttpService {
  private tuelloRecordsSubject = new Subject();

  constructor(private compressionService: CompressionService) {}

  public getJsonRecords(): Promise<any> {
    return this.compressionService.loadCompressed('tuelloRecords');
  }

  saveToLocalStorage(records: any) {
    this.compressionService.saveCompressed('tuelloRecords', records);
  }

  reset() {
    chrome.storage.local.remove(['tuelloRecords']);
  }

  getTuelloRecords() {
    return this.tuelloRecordsSubject.asObservable();
  }

  setTuelloRecords(tuelloRecords: any) {
    this.tuelloRecordsSubject.next(tuelloRecords);
  }
}
