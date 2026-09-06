import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { isMacPlatform } from 'chrome/src/utils/platform';

interface ShortcutRow {
  /**
   * Touches affichées en « kbd », séparées par un « + ». Chaque entrée passe par
   * le pipe de traduction : les symboles (↑, ⌘) traversent inchangés, seules les
   * touches nommées comme Échap portent une clé i18n.
   */
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

/**
 * Aide clavier de la mosaïque. Ouverte depuis la barre d'outils ou par F1 :
 * sans elle, rien n'indique que la vue se pilote entièrement au clavier.
 */
@Component({
  selector: 'mmn-keyboard-shortcuts-dialog',
  template: `
    <h2 mat-dialog-title>
      <mat-icon>keyboard</mat-icon>
      {{ 'mmn.mosaic.shortcuts.title' | translate }}
    </h2>
    <mat-dialog-content>
      @for (group of groups; track group.title) {
        <section class="shortcut-group">
          <h3>{{ group.title | translate }}</h3>
          @for (row of group.rows; track row.label) {
            <div class="shortcut-row">
              <span class="keys">
                @for (key of row.keys; track $index) {
                  @if ($index > 0) {
                    <span class="plus">+</span>
                  }
                  <kbd>{{ key | translate }}</kbd>
                }
              </span>
              <span class="desc">{{ row.label | translate }}</span>
            </div>
          }
        </section>
      }
      <p class="hint">
        <mat-icon>info_outline</mat-icon>
        {{ 'mmn.mosaic.shortcuts.hint' | translate }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="accent" mat-dialog-close>{{ 'mmn.mosaic.dialog.close' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      mat-dialog-content {
        min-width: 420px;
        max-width: 560px;
      }
      .shortcut-group {
        margin-bottom: 18px;
      }
      .shortcut-group h3 {
        margin: 0 0 8px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.6;
      }
      .shortcut-row {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 5px 0;
      }
      .keys {
        flex: 0 0 150px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
      }
      .plus {
        opacity: 0.45;
        font-size: 11px;
      }
      kbd {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 6px;
        border: 1px solid rgba(0, 0, 0, 0.18);
        border-bottom-width: 2px;
        background: rgba(0, 0, 0, 0.04);
        font-family: inherit;
        font-size: 12px;
        line-height: 18px;
        white-space: nowrap;
      }
      .desc {
        flex: 1;
        font-size: 13px;
        line-height: 1.35;
      }
      .hint {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 4px 0 0;
        font-size: 12px;
        opacity: 0.7;
      }
      .hint mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      :host-context(.black-theme) kbd {
        border-color: rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.08);
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe]
})
export class KeyboardShortcutsDialogComponent {
  /** Symboles Apple sur macOS, libellés textuels ailleurs : même convention que les raccourcis du Spy */
  private readonly alt = isMacPlatform() ? '⌥' : 'Alt';
  private readonly ctrl = isMacPlatform() ? '⌘' : 'Ctrl';

  readonly groups: ShortcutGroup[] = [
    {
      title: 'mmn.mosaic.shortcuts.group.navigation',
      rows: [
        { keys: ['↑', '↓'], label: 'mmn.mosaic.shortcuts.updown' },
        { keys: ['←', '→'], label: 'mmn.mosaic.shortcuts.leftright' },
        { keys: ['mmn.mosaic.shortcuts.key.escape'], label: 'mmn.mosaic.shortcuts.escape' }
      ]
    },
    {
      title: 'mmn.mosaic.shortcuts.group.open',
      rows: [
        { keys: ['↵'], label: 'mmn.mosaic.shortcuts.enter' },
        { keys: [this.ctrl, '↵'], label: 'mmn.mosaic.shortcuts.enter.background' },
        { keys: [this.alt, '1…9'], label: 'mmn.mosaic.shortcuts.digits' },
        { keys: [this.alt, this.ctrl, '1…9'], label: 'mmn.mosaic.shortcuts.digits.background' }
      ]
    },
    {
      title: 'mmn.mosaic.shortcuts.group.search',
      rows: [
        { keys: ['A…Z'], label: 'mmn.mosaic.shortcuts.type' },
        { keys: ['F1'], label: 'mmn.mosaic.shortcuts.help' }
      ]
    }
  ];
}
