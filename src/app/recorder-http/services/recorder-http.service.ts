import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CompressionService } from '../../core/compression/compression.service';
import { MockProfilesService } from './mock-profiles.service';

/**
 * Permet de stocker les flux json de tous les services
 */
@Injectable({
  providedIn: 'root'
})
export class RecorderHttpService {
  private tuelloRecordsSubject = new Subject();

  constructor(
    private compressionService: CompressionService,
    private mockProfilesService: MockProfilesService
  ) {}

  public async getJsonRecords(): Promise<any> {
    const profile = await this.mockProfilesService.getActiveProfile();
    if (profile) {
      return profile.mocks;
    }
    // Fallback sur l'ancien système si pas de profil
    return this.compressionService.loadCompressed('tuelloRecords');
  }

  async saveToLocalStorage(records: any) {
    const profile = await this.mockProfilesService.getActiveProfile();
    if (profile) {
      await this.mockProfilesService.updateProfileMocks(profile.id, records);
    }
    // Toujours sauvegarder dans tuelloRecords pour la compatibilité avec httpmanager
    await this.compressionService.saveCompressed('tuelloRecords', records);
  }

  async reset() {
    // Passe par le service worker (writeChain de CLEAR_HTTP_RECORDS) plutôt que
    // d'écrire directement dans chrome.storage.local : un enregistrement HTTP en
    // cours (persistBatch) pourrait sinon relire les mocks juste avant cet
    // effacement puis les réécrire juste après, ressuscitant la liste supprimée.
    const response = await new Promise<{ success: boolean } | undefined>((resolve) => {
      chrome.runtime.sendMessage({ action: 'CLEAR_HTTP_RECORDS' }, (result) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        resolve(result);
      });
    });

    if (!response?.success) {
      throw new Error("Tuello: échec de l'effacement des enregistrements HTTP");
    }
  }

  getTuelloRecords() {
    return this.tuelloRecordsSubject.asObservable();
  }

  setTuelloRecords(tuelloRecords: any) {
    this.tuelloRecordsSubject.next(tuelloRecords);
  }
}
