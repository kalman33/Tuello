import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogTitle, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { TranslatePipe } from "@ngx-translate/core";
import { MatButton } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'mmn-json-editor',
    templateUrl: './json-editor.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [fadeInAnimation],
    imports: [
        FormsModule,
        MatDialogTitle,
        MatDialogContent,
        MatDialogActions,
        MatButton,
        TranslatePipe,
    ]
})
export class JsonEditorComponent implements OnInit {
  jsonAction: string;
  jsonError: string | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<JsonEditorComponent>,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.jsonAction = JSON.stringify(this.data.action, null, 2);
  }

  /**
   * Valide le JSON en temps réel
   */
  onJsonChange(): void {
    this.jsonError = null;
    try {
      JSON.parse(this.jsonAction);
    } catch (e) {
      this.jsonError = (e as Error).message;
    }
    this.cdr.markForCheck();
  }

  /**
   * Fermeture de la popin avec validation
   */
  close(): void {
    try {
      const parsedAction = JSON.parse(this.jsonAction);
      this.jsonError = null;
      this.dialogRef.close(parsedAction);
    } catch (e) {
      this.jsonError = (e as Error).message;
      this.cdr.markForCheck();
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
