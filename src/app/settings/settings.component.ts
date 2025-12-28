import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormField } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTab, MatTabGroup, MatTabLabel } from '@angular/material/tabs';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { saveAs } from 'file-saver';
import { take } from 'rxjs';
import * as enMessages from '../../assets/i18n/en.json';
import * as frMessages from '../../assets/i18n/fr.json';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ConfigurationService } from '../core/configuration/configuration.service';
import { CompressionService, CompressionStats } from '../core/compression/compression.service';
import { ConfirmDialogComponent } from '../core/confirmation-dialog/confirmation-dialog.component';
import { formatDate } from '../core/utils/date-utils';
import { ThemeService } from '../theme/theme.service';
import { SettingsMenuComponent } from './menus/settings-menu.component';

export interface StorageStats {
    key: string;
    originalSize: string;
    currentSize: string;
    ratio: number;
    isCompressed: boolean;
}

@Component({
    selector: 'mmn-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FlexModule,
        FormsModule,
        MatTabGroup,
        MatTab,
        MatTabLabel,
        MatIcon,
        NgClass,
        MatDialogModule,
        MatDialogModule,
        MatButtonModule,
        ExtendedModule,
        MatSlideToggle,
        MatFormField,
        MatSelect,
        MatOption,
        MatSlider,
        MatSliderThumb,
        SettingsMenuComponent,
        MatButton,
        TranslatePipe
    ]
})
export class SettingsComponent implements OnInit {
    routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;
    darkMode: boolean;
    deepMockLevel = 0;
    mouseCoordinates: boolean;
    desactivate = false;
    verboseMode: boolean;
    languages = [
        { value: 'en', label: 'en' },
        { value: 'fr', label: 'fr' }
    ];

    @ViewChild('fileInput') fileInput: ElementRef;
    jsonContent;

    selectedLanguage;

    // Statistiques de compression
    storageStats: StorageStats[] = [];
    totalOriginalSize = '';
    totalCurrentSize = '';
    totalSaved = '';

    private cdr = inject(ChangeDetectorRef);

    constructor(
        private themeService: ThemeService,
        private translate: TranslateService,
        private snackBar: MatSnackBar,
        private configurationService: ConfigurationService,
        private compressionService: CompressionService,
        private zone: NgZone,
        private dialog: MatDialog
    ) {}

    ngOnInit() {
        this.init();
        this.loadCompressionStats();
    }

    async loadCompressionStats() {
        try {
            const stats = await this.compressionService.getStorageStats();
            this.storageStats = [];
            let totalOriginal = 0;
            let totalCurrent = 0;

            stats.forEach((stat, key) => {
                totalOriginal += stat.originalSize;
                totalCurrent += stat.currentSize;
                this.storageStats.push({
                    key,
                    originalSize: this.compressionService.formatSize(stat.originalSize),
                    currentSize: this.compressionService.formatSize(stat.currentSize),
                    ratio: stat.ratio,
                    isCompressed: stat.ratio > 0
                });
            });

            this.totalOriginalSize = this.compressionService.formatSize(totalOriginal);
            this.totalCurrentSize = this.compressionService.formatSize(totalCurrent);
            this.totalSaved = this.compressionService.formatSize(totalOriginal - totalCurrent);
            this.cdr.detectChanges();
        } catch (error) {
            console.error('Erreur chargement stats compression:', error);
        }
    }

    init() {
        chrome.storage.local.get(['language', 'darkMode', 'deepMockLevel', 'mouseCoordinates', 'verboseMode'], (results) => {
            if (results['language']) {
                this.selectedLanguage = results['language'];
            }
            if (results['darkMode']) {
                this.darkMode = results['darkMode'];

                if (this.darkMode) {
                    // positionne le mode dark
                    this.toggleTheme(this.darkMode);
                }
            }

            if (results['mouseCoordinates']) {
                this.mouseCoordinates = results['mouseCoordinates'];
            }

            if (results['verboseMode']) {
                this.verboseMode = results['verboseMode'];
            }

            if (results['deepMockLevel']) {
                this.deepMockLevel = results['deepMockLevel'];
            }
            this.cdr.detectChanges();
        });
    }

    /**
     * Permet de basculer de thème
     */
    toggleTheme(darkModevalue: boolean) {
        chrome.storage.local.set({ darkMode: darkModevalue });
        this.themeService.toggleTheme(darkModevalue);
    }

    updateDeepMockLevel(event) {
        chrome.storage.local.set({ deepMockLevel: event.value });
        this.deepMockLevel = event.value;
    }

    toggleMouseCoordinatesOption(mouseCoordinatesValue: boolean) {
        chrome.storage.local.set({ mouseCoordinates: mouseCoordinatesValue });
        // on previent background qui va prevenir contentscript qu'on a modifié le mouseCoordinates
        chrome.runtime.sendMessage(
            {
                action: 'MOUSE_COORDINATES',
                value: mouseCoordinatesValue
            },
            () => {}
        );
    }

    toggleDesactivate(e) {
        if (!this.desactivate) {
            chrome.storage.local.set({ disabled: true });
            // on previent background
            chrome.runtime.sendMessage(
                {
                    action: 'updateIcon',
                    value: 'tuello-stop-32x32.png'
                },
                () => {}
            );
            chrome.tabs.getCurrent((tab) => {
                chrome.tabs.sendMessage(
                    tab.id,
                    'toggle',
                    {
                        frameId: 0
                    },
                    () => {}
                );
            });
            e.source.checked = false;
            this.desactivate = false;
        } else {
            this.desactivate = !this.desactivate;
        }
    }

    toggleVerboseMode(verboseModeValue: boolean) {
        chrome.storage.local.set({ verboseMode: verboseModeValue });
    }

    onLanguageSelect({ value }) {
        chrome.storage.local.set({ language: value });
        this.translate.use(value);
        if (value === 'fr') {
            chrome.storage.local.set({ messages: frMessages });
        } else {
            chrome.storage.local.set({ messages: enMessages });
        }
        chrome.runtime.sendMessage(
            {
                action: 'UPDATE_MENU'
            },
            () => {}
        );
    }

    async save() {
        const all = await chrome.storage.local.get();
        const value = formatDate(new Date());
        const txtBlob = new Blob([JSON.stringify(all)], { type: 'text/plain;charset=utf-8' });
        saveAs(txtBlob, `tuello-global.${value}.json`);
    }

    clear() {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '350px',
            data: { message: this.translate.instant('mmn.settings.setup.button.clear.message') }
        });

        dialogRef
            .afterClosed()
            .pipe(take(1))
            .subscribe((result) => {
                if (result) {
                    chrome.storage.local.clear();
                }
            });
    }

    public onChange(fileList: any): void {
        const file = fileList.target.files[0];
        const fileReader: FileReader = new FileReader();
        fileReader.onloadend = (x) => {
            try {
                this.jsonContent = JSON.parse(fileReader.result as string);
                chrome.storage.local.set(this.jsonContent, () => {
                    this.init();
                    this.configurationService.init();
                    this.zone.run(() => {
                        this.snackBar.open(this.translate.instant('mmn.spy-http.import.message'), this.translate.instant('mmn.recorder-http.export.saveAsLib.information.success.action'), { duration: 2000 });
                    });
                });
            } catch (e) {
                this.snackBar.open(this.translate.instant('mmn.settings.import.message'), this.translate.instant('mmn.settings.import.error.action'), { duration: 1000, verticalPosition: 'bottom' });
            }
        };
        fileReader.onerror = (event) => {
            this.snackBar.open(this.translate.instant('mmn.settings.import.message'), this.translate.instant('mmn.settings.import.error.action'), { duration: 1000, verticalPosition: 'bottom' });
            fileReader.abort();
        };
        fileReader.readAsText(file);
    }

    selectFile() {
        this.fileInput.nativeElement.value = '';
        this.fileInput.nativeElement.click();
    }
}
