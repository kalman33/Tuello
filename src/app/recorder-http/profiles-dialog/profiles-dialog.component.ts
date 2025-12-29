import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatList, MatListItem } from '@angular/material/list';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { MockProfile } from '../models/mock-profile';
import { MockProfilesService } from '../services/mock-profiles.service';

@Component({
  selector: 'mmn-profiles-dialog',
  templateUrl: './profiles-dialog.component.html',
  styleUrls: ['./profiles-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatIconButton,
    MatIcon,
    MatList,
    MatListItem,
    MatRadioGroup,
    MatRadioButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatTooltip,
    FormsModule,
    TranslatePipe
  ]
})
export class ProfilesDialogComponent implements OnInit {
  profiles: MockProfile[] = [];
  activeProfileId: string | null = null;
  editingProfileId: string | null = null;
  editingName = '';
  newProfileName = '';
  isCreating = false;

  constructor(
    public dialogRef: MatDialogRef<ProfilesDialogComponent>,
    private mockProfilesService: MockProfilesService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadProfiles();
  }

  async loadProfiles() {
    this.profiles = await this.mockProfilesService.getProfiles();
    this.activeProfileId = await this.mockProfilesService.getActiveProfileId();
    this.cdr.detectChanges();
  }

  async onProfileSelect(profileId: string) {
    await this.mockProfilesService.setActiveProfile(profileId);
    this.activeProfileId = profileId;
    this.dialogRef.close({ action: 'switch', profileId });
  }

  startEditing(profile: MockProfile, event: Event) {
    event.stopPropagation();
    this.editingProfileId = profile.id;
    this.editingName = profile.name;
    this.cdr.detectChanges();
  }

  async saveEditing() {
    if (this.editingProfileId && this.editingName.trim()) {
      await this.mockProfilesService.renameProfile(this.editingProfileId, this.editingName.trim());
      this.editingProfileId = null;
      this.editingName = '';
      await this.loadProfiles();
    }
  }

  cancelEditing() {
    this.editingProfileId = null;
    this.editingName = '';
  }

  startCreating() {
    this.isCreating = true;
    this.newProfileName = '';
    this.cdr.detectChanges();
  }

  async createProfile() {
    if (this.newProfileName.trim()) {
      const newProfile = await this.mockProfilesService.createProfile(this.newProfileName.trim());
      this.isCreating = false;
      this.newProfileName = '';
      await this.loadProfiles();
      // Basculer automatiquement sur le nouveau profil
      await this.onProfileSelect(newProfile.id);
    }
  }

  cancelCreating() {
    this.isCreating = false;
    this.newProfileName = '';
  }

  async deleteProfile(profile: MockProfile, event: Event) {
    event.stopPropagation();
    if (this.profiles.length <= 1) {
      return; // Ne pas supprimer le dernier profil
    }
    await this.mockProfilesService.deleteProfile(profile.id);
    await this.loadProfiles();

    // Si on a supprimé le profil actif, notifier le parent
    if (profile.id === this.activeProfileId) {
      this.dialogRef.close({ action: 'switch', profileId: this.profiles[0]?.id });
    }
  }

  close() {
    this.dialogRef.close();
  }
}
