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
        // Vider les mocks du profil actif
        const profile = await this.mockProfilesService.getActiveProfile();
        if (profile) {
            await this.mockProfilesService.updateProfileMocks(profile.id, []);
        }
        // Vider aussi tuelloRecords pour la compatibilité
        await this.compressionService.saveCompressed('tuelloRecords', []);
    }

    getTuelloRecords() {
        return this.tuelloRecordsSubject.asObservable();
    }

    setTuelloRecords(tuelloRecords: any) {
        this.tuelloRecordsSubject.next(tuelloRecords);
    }
}
