import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { WELCOME_FEATURES, WelcomeDialogResult, WelcomeFeature } from '../guide-tour.models';
import { welcomeDialogAnimation } from '../guide-tour.animations';

@Component({
  selector: 'mmn-welcome-dialog',
  templateUrl: './welcome-dialog.component.html',
  styleUrls: ['./welcome-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    TranslatePipe
  ],
  animations: [welcomeDialogAnimation]
})
export class WelcomeDialogComponent {
  features: WelcomeFeature[] = WELCOME_FEATURES;
  neverShowAgain = false;

  constructor(
    public dialogRef: MatDialogRef<WelcomeDialogComponent>
  ) {}

  startTour(): void {
    const result: WelcomeDialogResult = {
      action: 'startTour',
      neverShowAgain: this.neverShowAgain
    };
    this.dialogRef.close(result);
  }

  skip(): void {
    const result: WelcomeDialogResult = {
      action: 'skip',
      neverShowAgain: this.neverShowAgain
    };
    this.dialogRef.close(result);
  }
}
