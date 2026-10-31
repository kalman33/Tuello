import { LowerCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe } from '@ngx-translate/core';
import { take } from 'rxjs';
import { ChromeExtentionUtilsService } from '../../core/utils/chrome-extention-utils.service';
import { JsonEditorComponent } from '../json-editor/json-editor.component';
import { Action } from '../models/Action';

@Component({
    selector: 'mmn-action',
    templateUrl: './action.component.html',
    styleUrls: ['./action.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FlexModule, MatTooltip, MatIcon, MatIconButton, LowerCasePipe, TranslatePipe]
})
export class ActionComponent implements OnChanges {
    @Input() action: Action;
    @Input() index: number;

    @Output() delete: EventEmitter<number> = new EventEmitter<number>();
    @Output() duplicate: EventEmitter<number> = new EventEmitter<number>();
    @Output() modify: EventEmitter<[number, Action]> = new EventEmitter<[number, Action]>();
    @Output() preview: EventEmitter<number> = new EventEmitter<number>();
    @Output() decreaseDelay: EventEmitter<number> = new EventEmitter<number>();
    /** Place le repère « Début du test » juste avant cette action */
    @Output() testStart: EventEmitter<number> = new EventEmitter<number>();

    /** URL de navigation, affichée au survol du tag (l'afficher en ligne décalait les boutons) */
    navigationUrl: string = '';

    /** Rechargement de page (F5) : même action que la navigation, mais rejouée sur place */
    isReload = false;

    /** Élément d'une vérification de visibilité, tel que l'utilisateur le reconnaît */
    assertionSubject = '';

    constructor(
        public dialog: MatDialog,
        public chromeExtentionUtilsService: ChromeExtentionUtilsService
    ) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['action']) {
            this.navigationUrl = this.action?.userAction?.hrefLocation || '';
            this.isReload = this.action?.userAction?.type === 'reload';
            const target = this.action?.userAction?.target;
            this.assertionSubject = target?.name || target?.label || target?.text || target?.placeholder || this.action?.userAction?.selector || '';
        }
    }

    deleteAction() {
        this.delete.emit(this.index);
    }

    duplicateAction() {
        this.duplicate.emit(this.index);
    }

    previewAction() {
        this.preview.emit(this.index);
    }

    markTestStart() {
        this.testStart.emit(this.index);
    }

    reduceDelay() {
        this.decreaseDelay.emit(this.index);
    }

    openJsonEditor() {
        const dialogRef = this.dialog.open(JsonEditorComponent, {
            data: {
                action: this.action
            },
            maxWidth: '98vw',
            maxHeight: '90vh',
            height: '90%',
            width: '98%'
        });

        dialogRef
            .afterClosed()
            .pipe(take(1))
            .subscribe((jsonAction: Action) => {
                if (jsonAction) {
                    this.action = jsonAction;
                    this.modify.emit([this.index, jsonAction]);
                }
            });
    }
}
