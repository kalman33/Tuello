import { NgClass } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import JSON5 from 'json5';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ErrorJsonComponent } from './error/error-json.component';

@Component({
  selector: 'mmn-json-formatter',
  templateUrl: './json-formatter.component.html',
  styleUrls: ['./json-formatter.component.scss'],
  imports: [FlexModule, FormsModule, NgClass, ExtendedModule, MatButton, MatIcon, MatTooltip, TranslatePipe]
})
export class JsonFormatterComponent {

  private snackBar = inject(MatSnackBar);

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  constructor(
    private translate: TranslateService,
    public dialog: MatDialog,
    private ref: ChangeDetectorRef
  ) {

  }

  jsonInput: string = '';

  beautifyJson() {
    if (this.jsonInput) {
      try {
        // Correction : Ajout de guillemets autour des nombres en tant que clés
        const fixedJsonString = this.jsonInput.replace(/(\{|,)\s*(\d+)\s*:/g, '$1 "$2":');
        
        // Parse le JSON et le formate avec une indentation de 2 espaces
        const parsedJson = JSON5.parse(fixedJsonString);
        this.jsonInput = JSON.stringify(parsedJson, null, 2); // Beautify
      } catch (e) {
        let message = this.translate.instant('mmn.json-formatter.json.invalid');
        if (e instanceof Error) {
          const errorPosition = e.message.match(/at (\d+):(\d+)/);

          if (errorPosition) {
            const [_, lineNumber, columnNumber] = errorPosition.map(Number);

            // Trouver l'index exact dans la chaîne JSON
            const lines = this.jsonInput.split('\n');
            const charIndex = lines.slice(0, lineNumber - 1).reduce((acc, line) => acc + line.length + 1, 0) + (columnNumber - 1);

            // Extraire le JSON avant l'erreur
            const jsonBeforeError = this.jsonInput.substring(0, charIndex);

            // Trouver **toutes** les clés-valeurs avant l'erreur
            const matches = [...jsonBeforeError.matchAll(/(?:\"?([^"\s:{}]+)\"?)\s*:\s*([^,}\n]+)/g)];

            let lastEntry = '';
            if (matches.length > 0) {
              // Récupérer la dernière clé-valeur trouvée avant l'erreur
              lastEntry = matches.at(-1)[0];
            } else {
              // Cas où l'erreur est sur le premier élément du JSON
              lastEntry = "L'erreur est sur le premier élément, aucun élément précédent trouvé.";
            }

            const dialogRef = this.dialog.open(ErrorJsonComponent, {
              width: '350px',
              data: { line: lineNumber, column: columnNumber, lastEntry }
            });

            dialogRef.afterClosed().subscribe(result => {
              setTimeout(() => {
                const textarea = document.getElementById('jsonTextarea') as HTMLTextAreaElement;
                if (textarea) {
                  textarea.focus();
                  textarea.setSelectionRange(charIndex, charIndex);
                }
              });
            });


          }
        } else {
          console.error('Une erreur inconnue est survenue', e);
        }
      }
    }
  }


  /**
   * Permet de copier dans le presse-papier
   * Cette fonctionnalité sera rajouté dans le cdk en version 9.xs
   */
  copyToClipboard() {
    const el = document.createElement('textarea');
    try {
      el.value = this.jsonInput;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      this.snackBar.open(this.translate.instant('mmn.json-formatter.button.copied'), '', { duration: 1000 });
    } catch (e) {
      // @TODO : a compléter
    }
  }

  cleanInputText() {
    this.jsonInput = '';
  }

}
