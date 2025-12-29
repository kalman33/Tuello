import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CompressionService } from '../../core/compression/compression.service';
import { MockProfile, MockProfilesStorage } from '../models/mock-profile';

@Injectable({ providedIn: 'root' })
export class MockProfilesService {
    private profilesSubject = new Subject<MockProfile[]>();
    private activeProfileSubject = new Subject<MockProfile | null>();

    profiles$ = this.profilesSubject.asObservable();
    activeProfile$ = this.activeProfileSubject.asObservable();

    constructor(private compressionService: CompressionService) {}

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async getProfiles(): Promise<MockProfile[]> {
        const storage = await this.compressionService.loadCompressed<MockProfilesStorage>('tuelloMockProfiles');
        return storage?.profiles || [];
    }

    async getActiveProfileId(): Promise<string | null> {
        return new Promise((resolve) => {
            chrome.storage.local.get(['tuelloActiveProfileId'], (result) => {
                resolve(result['tuelloActiveProfileId'] || null);
            });
        });
    }

    async getActiveProfile(): Promise<MockProfile | null> {
        const profiles = await this.getProfiles();
        const activeId = await this.getActiveProfileId();

        if (!activeId || profiles.length === 0) {
            return profiles[0] || null;
        }

        return profiles.find((p) => p.id === activeId) || profiles[0] || null;
    }

    async saveProfiles(profiles: MockProfile[]): Promise<void> {
        const activeId = await this.getActiveProfileId();
        const storage: MockProfilesStorage = {
            profiles,
            activeProfileId: activeId || profiles[0]?.id || ''
        };
        await this.compressionService.saveCompressed('tuelloMockProfiles', storage);
        this.profilesSubject.next(profiles);
    }

    async setActiveProfile(profileId: string): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set({ tuelloActiveProfileId: profileId }, () => {
                this.getActiveProfile().then((profile) => {
                    this.activeProfileSubject.next(profile);
                    resolve();
                });
            });
        });
    }

    async createProfile(name: string, mocks: any[] = []): Promise<MockProfile> {
        const profiles = await this.getProfiles();
        const now = Date.now();

        const newProfile: MockProfile = {
            id: this.generateId(),
            name,
            mocks,
            createdAt: now,
            updatedAt: now
        };

        profiles.push(newProfile);
        await this.saveProfiles(profiles);

        return newProfile;
    }

    async renameProfile(profileId: string, newName: string): Promise<void> {
        const profiles = await this.getProfiles();
        const profile = profiles.find((p) => p.id === profileId);

        if (profile) {
            profile.name = newName;
            profile.updatedAt = Date.now();
            await this.saveProfiles(profiles);
        }
    }

    async deleteProfile(profileId: string): Promise<void> {
        let profiles = await this.getProfiles();
        const activeId = await this.getActiveProfileId();

        // Ne pas supprimer si c'est le seul profil
        if (profiles.length <= 1) {
            throw new Error('Cannot delete the last profile');
        }

        profiles = profiles.filter((p) => p.id !== profileId);
        await this.saveProfiles(profiles);

        // Si on supprime le profil actif, basculer sur le premier
        if (activeId === profileId && profiles.length > 0) {
            await this.setActiveProfile(profiles[0].id);
        }
    }

    async updateProfileMocks(profileId: string, mocks: any[]): Promise<void> {
        const profiles = await this.getProfiles();
        const profile = profiles.find((p) => p.id === profileId);

        if (profile) {
            profile.mocks = mocks;
            profile.updatedAt = Date.now();
            await this.saveProfiles(profiles);
        }
    }

    async migrateFromLegacy(): Promise<boolean> {
        // Vérifier si la migration a déjà été faite
        const existingProfiles = await this.getProfiles();
        if (existingProfiles.length > 0) {
            return false; // Déjà migré
        }

        // Charger les anciens mocks
        const legacyMocks = await this.compressionService.loadCompressed<any[]>('tuelloRecords');

        // Créer le profil par défaut
        const defaultProfile = await this.createProfile('Default', legacyMocks || []);

        // Définir comme profil actif
        await this.setActiveProfile(defaultProfile.id);

        return true;
    }
}
