import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import JSON5 from 'json5';
import { take } from 'rxjs';
import { ContextMenuItem, createJSONEditor, JSONContent, JsonEditor, RenderContextMenuContext } from 'vanilla-jsoneditor';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ConfirmDialogComponent } from '../core/confirmation-dialog/confirmation-dialog.component';
import { ExportComponent } from './export/export.component';
import { ImportDialogComponent, ImportMode } from './import-dialog/import-dialog.component';
import { MockProfile } from './models/mock-profile';
import { ProfilesDialogComponent } from './profiles-dialog/profiles-dialog.component';
import { TagElement } from './models/TagElement';
import { MockProfilesService } from './services/mock-profiles.service';
import { RecorderHttpService } from './services/recorder-http.service';
import { TagsService } from './services/tags.service';
import { RecorderHttpSettingsComponent } from './settings/recorder-http-settings.component';

@Component({
    selector: 'mmn-recorder-http',
    templateUrl: './recorder-http.component.html',
    styleUrls: ['./recorder-http.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FlexModule, FormsModule, NgClass, ExtendedModule, MatButton, MatIconButton, MatIcon, MatTooltip, MatSlideToggle, MatFormField, MatSelect, MatOption, TranslatePipe]
})
export class RecorderHttpComponent implements OnInit, OnDestroy {
    constructor(
        private dialog: MatDialog,
        private infoBar: MatSnackBar,
        private recorderService: RecorderHttpService,
        private mockProfilesService: MockProfilesService,
        private translate: TranslateService,
        private ref: ChangeDetectorRef,
        private router: Router,
        private tagsService: TagsService
    ) {}

    @ViewChild('fileInput') fileInput: ElementRef;

    // Json Editor
    options: any;
    jsonEditorTree: JsonEditor;
    isBlackTheme = false;

    routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

    httpMockActivated: boolean;
    httpRecordActivated: boolean;
    dernierEvenementTampon: number;
    private debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private chromeMessageListener: (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void;
    private importMode: ImportMode = 'replace';
    records;

    // Profils
    profiles: MockProfile[] = [];
    activeProfileId: string | null = null;

    ngOnInit() {
        // Vérifier si body a la classe 'black-theme'
        const hasBlackTheme = document.body.classList.contains('black-theme');
        this.isBlackTheme = hasBlackTheme;

        chrome.storage.local.get(['httpMock', 'httpRecord'], (results) => {
            this.httpRecordActivated = results['httpRecord'];
            this.httpMockActivated = results['httpMock'];
            this.ref.detectChanges();
        });

        // Migration et chargement des profils
        this.initProfiles();

        this.chromeMessageListener = (message, sender, sendResponse) => {
            if (message.refresh) {
                this.gererRefresh();
            }
            sendResponse();
        };
        chrome.runtime.onMessage.addListener(this.chromeMessageListener);
    }

    ngOnDestroy(): void {
        // Suppression du listener Chrome pour éviter les fuites mémoire
        if (this.chromeMessageListener) {
            chrome.runtime.onMessage.removeListener(this.chromeMessageListener);
        }
        // Nettoyage du timeout de debounce
        if (this.debounceTimeoutId) {
            clearTimeout(this.debounceTimeoutId);
        }
        if (this.jsonEditorTree) {
            this.jsonEditorTree.destroy();
        }
    }

    async refresh() {
        // recupération des enregistrements (avec décompression LZ)
        try {
            const records = await this.recorderService.getJsonRecords();
            this.records = Array.isArray(records) ? records : [];
            this.jsonEditorTree?.update({ json: this.records });
        } catch (e) {
            this.jsonEditorTree?.update({ json: [] });
        }
    }

    gererRefresh() {
        // Annuler le timeout précédent s'il existe (debounce)
        if (this.debounceTimeoutId) {
            clearTimeout(this.debounceTimeoutId);
        }

        // Attendre 300ms avant de traiter l'événement
        this.debounceTimeoutId = setTimeout(() => {
            this.refresh();
            this.debounceTimeoutId = null;
        }, 300);
    }

    /**
     * initialisation du jsoneditor
     */
    private initJsonEditor() {
        const clearResponse = this.translate.instant('mmn.jsoneditor.menu.clearResponse');
        const clearResponseTitle = this.translate.instant('mmn.jsoneditor.menu.clearResponse.title');

        //   onValidationError: errors => {
        //     errors.forEach(error => {
        //       switch (error.type) {
        //         case 'validation': // schema validation error
        //           this.infoBar.open('Format json invalide', '', {
        //             duration: 2000,
        //             verticalPosition: 'bottom',
        //           });
        //           break;
        //         case 'customValidation': // custom validation error
        //           this.infoBar.open('Format json invalide', '', {
        //             duration: 2000,
        //             verticalPosition: 'bottom',
        //           });
        //           break;
        //         case 'error': // json parse error
        //           this.infoBar.open('Json invalide', '', {
        //             duration: 2000,
        //             verticalPosition: 'bottom',
        //           });
        //           break;
        //       }
        //     });

        let options = {
            mode: 'tree', // Modes disponibles : "tree", "text", "view"
            indentation: 2, // Indentation pour le mode code
            mainMenuBar: true, // Afficher la barre d'outils
            navigationBar: true, // Activer la navigation JSON
            readOnly: false, // Permettre l'édition
            statusBar: false // Afficher la barre de statut
        };

        // init du jsoneditor
        this.jsonEditorTree = createJSONEditor({
            target: document.getElementById('jsonEditorTree'),
            props: {
                content: { json: [] },
                options,
                onRenderMenu: (items, context) => items.filter((item) => !item.text && item.type !== 'separator' && item.className !== 'jse-transform'),
                onClassName: function (path, value) {
                    // Colorer la valeur httpCode elle-même
                    if (path[path.length - 1] === 'httpCode') {
                        if (value.toString().startsWith('5')) {
                            return 'server-error-http-response';
                        }
                        if (value.toString().startsWith('4')) {
                            return 'client-error-http-response';
                        }
                        return null;
                    }

                    // Colorer toute la ligne (entrée du tableau) selon son httpCode
                    if (path.length === 1 && typeof value === 'object' && value !== null) {
                        const httpCode = value.httpCode;
                        if (httpCode !== undefined && httpCode !== null) {
                            const codeStr = httpCode.toString();
                            if (codeStr.startsWith('5')) {
                                return 'http-row-error-5xx';
                            }
                            if (codeStr.startsWith('4')) {
                                return 'http-row-error-4xx';
                            }
                        }
                    }

                    return null;
                },
                onChange: () => {
                    this.updateData();
                },
                onRenderContextMenu: (items: ContextMenuItem[], context: RenderContextMenuContext) => {
                    // On supprime le separator ainsi que le bloc couper/copier/coller
                    items.splice(1, 2);

                    const path = context.selection?.['path'];
                    if (!path || path.length < 2) return items;

                    // Vérifie si on est sur 'response' ou sur une clé enfant de 'response'
                    const isOnResponse = path[path.length - 1] === 'response';
                    const isInsideResponse = path.includes('response') && path.length > 2;

                    let menuClearResponse, menuAddTag;

                    // Menu "Vider la réponse" : uniquement sur response
                    if (isOnResponse) {
                        menuClearResponse = {
                            type: 'row',
                            text: this.translate.instant('mmn.jsoneditor.menu.clearResponse'),
                            title: this.translate.instant('mmn.jsoneditor.menu.clearResponse.title'),
                            disabled: false,
                            onClick: () => {
                                const json = (this.jsonEditorTree.get() as JSONContent).json;
                                if (json && Array.isArray(json)) {
                                    const target = json[path[0]][path[1]];
                                    json[path[0]][path[1]] = Array.isArray(target) ? [] : {};
                                    this.jsonEditorTree.update({ json: json });
                                    this.updateData();
                                }
                            }
                        };
                    }

                    // Menu "Ajouter un tag" : sur response ou sur une clé enfant de response
                    if (isOnResponse || isInsideResponse) {
                        // Construit le chemin JSON depuis response (ex: "response.data.id" ou juste "response")
                        const responseIndex = path.indexOf('response');
                        const jsonKeyPath = path.slice(responseIndex).join('.');
                        const displayKey = path[path.length - 1];

                        menuAddTag = {
                            type: 'row',
                            text: this.translate.instant('mmn.jsoneditor.menu.addTag'),
                            title: this.translate.instant('mmn.jsoneditor.menu.addTag.title'),
                            disabled: false,
                            onClick: () => {
                                const json = (this.jsonEditorTree.get() as JSONContent).json;
                                if (json && Array.isArray(json)) {
                                    const api = json[path[0]];
                                    if (api) {
                                        const element: TagElement = {
                                            httpKey: api.key,
                                            jsonKey: jsonKeyPath,
                                            display: String(displayKey)
                                        };
                                        this.tagsService.addTagElement(element);
                                    }
                                }
                            }
                        };
                    }

                    if (menuClearResponse || menuAddTag) {
                        items.push({ type: 'separator' });
                        if (menuClearResponse) items.push(menuClearResponse);
                        if (menuAddTag) items.push(menuAddTag);
                    }

                    return items;
                }
            }
        });

        try {
            this.jsonEditorTree.update({ json: this.records });
        } catch (e) {
            this.jsonEditorTree.update({ json: [] });
        }
    }

    /**
     * Efface les enregistrements stockés dans le servcie recorderService et
     * vide le composant jsoneditor
     */
    effacerEnregistrements() {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
            width: '350px',
            data: { message: this.translate.instant('mmn.recorder-http.button.delete.message') }
        });

        dialogRef
            .afterClosed()
            .pipe(take(1))
            .subscribe(async (result) => {
                if (result) {
                    await this.recorderService.reset();
                    this.jsonEditorTree.update({ json: [] });
                    this.records = [];
                }
            });
    }

    /**
     * Permet d'activer les mock http
     */
    toggleHttpMock() {
        if (this.httpRecordActivated) {
            this.httpRecordActivated = false;
            chrome.storage.local.set({ httpRecord: false });
        }
        chrome.storage.local.set({ httpMock: this.httpMockActivated });
        chrome.runtime.sendMessage(
            {
                action: 'HTTP_MOCK_STATE',
                value: this.httpMockActivated
            },
            () => {}
        );
        if (this.httpMockActivated) {
            chrome.runtime.sendMessage(
                {
                    action: 'HTTP_RECORD_STATE',
                    value: false
                },
                () => {}
            );
        }
    }

    /**
     * Permet d'activer le mode enregistrement
     */
    toggleHttpRecord() {
        if (this.httpMockActivated) {
            this.httpMockActivated = false;
            chrome.storage.local.set({ httpMock: false });
        }
        chrome.storage.local.set({ httpRecord: this.httpRecordActivated });
        chrome.runtime.sendMessage(
            {
                action: 'HTTP_RECORD_STATE',
                value: this.httpRecordActivated
            },
            () => {}
        );
        if (this.httpRecordActivated) {
            chrome.runtime.sendMessage(
                {
                    action: 'HTTP_MOCK_STATE',
                    value: false
                },
                () => {}
            );
        }
    }

    /**
     * Permet de copier dans le presse-papier
     */
    async copyToClipboard() {
        try {
            const jsonData = this.jsonEditorTree.get() as JSONContent;
            const text = JSON.stringify(jsonData.json);
            await navigator.clipboard.writeText(text);
            this.infoBar.open(this.translate.instant('mmn.recorder-http.button.copied'), '', { duration: 1000 });
        } catch (e) {
            console.error('Tuello: Erreur lors de la copie dans le presse-papier', e);
        }
    }

    /**
     * Permet de mettre à jour les données si le json est valide
     */
    updateData() {
        const jsonData = this.jsonEditorTree.get() as JSONContent;
        if (jsonData.json) {
            // Sauvegarder l'objet directement (pas une chaîne JSON) pour que recordHttpListener
            // puisse correctement vérifier Array.isArray()
            this.recorderService.saveToLocalStorage(jsonData.json);
            chrome.runtime.sendMessage(
                {
                    action: 'MMA_RECORDS_CHANGE'
                },
                () => {}
            );
        } else {
            this.infoBar.open('Json invalide', '', {
                duration: 2000,
                verticalPosition: 'top'
            });
        }
    }

    save() {
        const jsonData = this.jsonEditorTree.get() as JSONContent;
        const dialogRef = this.dialog.open(ExportComponent, {
            data: jsonData.json
        });
    }

    public onChange(fileList: any): void {
        const file = fileList.target.files[0];
        const extension = file?.name?.split('.')?.pop()?.toLowerCase();
        const fileReader: FileReader = new FileReader();
        let jsonResult;
        fileReader.onloadend = (x) => {
            jsonResult = fileReader.result as string;

            if (jsonResult && extension === 'json') {
                this.processJsonResult(jsonResult);
            } else {
                this.processNonJsonResult(jsonResult);
            }
            this.infoBar.open(this.translate.instant('mmn.spy-http.import.message'), this.translate.instant('mmn.spy-http.import.success.action'), { duration: 2000 });
        };
        fileReader.onerror = (event) => {
            this.infoBar.open(this.translate.instant('mmn.spy-http.import.message'), this.translate.instant('mmn.spy-http.import.error.action'), { duration: 2000 });
            fileReader.abort();
        };
        fileReader.readAsText(file);
    }
    processNonJsonResult(jsonResult: string) {
        let data = this.extraireFluxJSON(jsonResult);
        const fixedJsonString = data.replace(/(\{|,)\s*(\d+)\s*:/g, '$1 "$2":');
        data = this.replaceDynamicData(fixedJsonString);
        const jsonData = JSON5.parse(data);
        this.applyImportedData(jsonData);
    }

    processJsonResult(jsonResult: string) {
        const data = this.replaceDynamicData(jsonResult);
        // Correction : Ajout de guillemets autour des nombres en tant que clés
        const fixedJsonString = data.replace(/(\{|,)\s*(\d+)\s*:/g, '$1 "$2":');
        const dataJson = JSON5.parse(fixedJsonString);
        this.applyImportedData(dataJson);
    }

    private applyImportedData(importedData: any[]) {
        if (this.importMode === 'add') {
            // Mode ajout : fusionner avec les données existantes sans doublons
            const currentData = (this.jsonEditorTree.get() as JSONContent).json;
            const existingRecords: any[] = Array.isArray(currentData) ? currentData : [];

            // Créer un Map avec les enregistrements existants (clé = key)
            const recordsMap = new Map<string, any>();
            for (const record of existingRecords) {
                if (record.key) {
                    recordsMap.set(record.key, record);
                }
            }

            // Ajouter/Remplacer avec les données importées
            for (const record of importedData) {
                if (record.key) {
                    recordsMap.set(record.key, record);
                }
            }

            // Convertir le Map en tableau
            const mergedData = Array.from(recordsMap.values());
            this.jsonEditorTree.update({ json: mergedData });
        } else {
            // Mode remplacement : remplacer les données existantes
            this.jsonEditorTree.update({ json: importedData });
        }
        this.updateData();
    }

    replaceDynamicData(data) {
        let ret = data.replace(/window.location.origin \+ "/g, '"###window.location.origin### ');
        ret = ret.replace(/window.location.origin \+ '/g, "'###window.location.origin### ");
        return ret;
    }

    selectFile() {
        const dialogRef = this.dialog.open(ImportDialogComponent, {
            width: '400px'
        });

        dialogRef
            .afterClosed()
            .pipe(take(1))
            .subscribe((result: ImportMode | undefined) => {
                if (result) {
                    this.importMode = result;
                    this.fileInput.nativeElement.click();
                    this.fileInput.nativeElement.value = ''; // permet de permettre le onchange si on reselectionne le meme fichier
                }
            });
    }

    addTags() {
        this.router.navigateByUrl('/recorder/tags', { skipLocationChange: true });
    }

    openSettings() {
        const dialogRef = this.dialog.open(RecorderHttpSettingsComponent);
    }

    async initProfiles() {
        // Migration des anciens mocks si nécessaire
        await this.mockProfilesService.migrateFromLegacy();

        // Charger les profils
        this.profiles = await this.mockProfilesService.getProfiles();
        this.activeProfileId = await this.mockProfilesService.getActiveProfileId();

        // Charger les mocks du profil actif
        const activeProfile = await this.mockProfilesService.getActiveProfile();
        this.records = activeProfile?.mocks || [];

        // Initialiser l'éditeur JSON
        this.initJsonEditor();
        this.ref.detectChanges();
    }

    async onProfileChange(profileId: string) {
        await this.mockProfilesService.setActiveProfile(profileId);
        this.activeProfileId = profileId;

        // Charger les mocks du nouveau profil
        const profile = this.profiles.find(p => p.id === profileId);
        if (profile) {
            this.records = profile.mocks || [];
            this.jsonEditorTree.update({ json: this.records });

            // Mettre à jour tuelloRecords pour que httpmanager utilise les nouveaux mocks
            await this.recorderService.saveToLocalStorage(this.records);

            // Notifier le changement pour httpmanager
            chrome.runtime.sendMessage({ action: 'MMA_RECORDS_CHANGE' }, () => {});
        }
        this.ref.detectChanges();
    }

    openProfilesDialog() {
        const dialogRef = this.dialog.open(ProfilesDialogComponent, {
            width: '400px'
        });

        dialogRef.afterClosed().pipe(take(1)).subscribe(async (result) => {
            if (result?.action === 'switch') {
                // Recharger les profils et basculer
                this.profiles = await this.mockProfilesService.getProfiles();
                this.activeProfileId = result.profileId;

                const profile = this.profiles.find(p => p.id === result.profileId);
                if (profile) {
                    this.records = profile.mocks || [];
                    this.jsonEditorTree.update({ json: this.records });

                    // Mettre à jour tuelloRecords pour que httpmanager utilise les nouveaux mocks
                    await this.recorderService.saveToLocalStorage(this.records);

                    // Notifier le changement pour httpmanager
                    chrome.runtime.sendMessage({ action: 'MMA_RECORDS_CHANGE' }, () => {});
                }
                this.ref.detectChanges();
            } else {
                // Juste recharger la liste des profils
                this.profiles = await this.mockProfilesService.getProfiles();
                this.ref.detectChanges();
            }
        });
    }

    private extraireFluxJSON(codeJS: string): string | null {
        // Expression régulière pour capturer la déclaration de la variable contenant le flux JSON
        const regex = /window(?:\.tuelloRecords|\['tuelloRecords'\])\s*=\s*(.*?); \/\/#ENDOFJSON#/s;

        // Recherche de la correspondance dans le code JavaScript
        const match = codeJS.match(regex);

        if (match && match[1]) {
            // Si une correspondance est trouvée, retourner la chaîne JSON capturée
            return match[1];
        } else {
            // Log un message d'erreur si aucune correspondance n'est trouvée
            console.error('Tuello: Variable contenant le flux JSON non trouvée');
            return null;
        }
    }
}
