import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ExtendedModule } from '@ngbracket/ngx-layout/extended';
import { FlexModule } from '@ngbracket/ngx-layout/flex';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ContextMenuItem, createJSONEditor, JSONContent, JsonEditor, RenderContextMenuContext } from 'vanilla-jsoneditor';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ExportComponent } from './export/export.component';
import { TagElement } from './models/TagElement';
import { RecorderHttpService } from './services/recorder-http.service';
import { TagsService } from './services/tags.service';
import { RecorderHttpSettingsComponent } from './settings/recorder-http-settings.component';
import JSON5 from 'json5';

@Component({
  selector: 'mmn-recorder-http',
  templateUrl: './recorder-http.component.html',
  styleUrls: ['./recorder-http.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlexModule, FormsModule, NgClass, ExtendedModule, MatButton, MatIcon, MatTooltip, MatSlideToggle, TranslatePipe]
})
export class RecorderHttpComponent implements OnInit, OnDestroy {
  constructor(
    private dialog: MatDialog,
    private infoBar: MatSnackBar,
    private recorderService: RecorderHttpService,
    private translate: TranslateService,
    private ref: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private router: Router,
    private tagsService: TagsService
  ) { }

  @ViewChild('fileInput') fileInput: ElementRef;

  // Json Editor
  options: any;
  jsonEditorTree: JsonEditor;
  isBlackTheme = false;

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  httpMockActivated: boolean;
  httpRecordActivated: boolean;
  dernierEvenementTampon: number;
  records;


  ngOnInit() {
    // Vérifier si body a la classe 'black-theme'
    const hasBlackTheme = document.body.classList.contains('black-theme');
    this.isBlackTheme = hasBlackTheme;

    chrome.storage.local.get(['httpMock', 'httpRecord'], results => {
      this.httpRecordActivated = results['httpRecord'];
      this.httpMockActivated = results['httpMock'];
      this.ref.detectChanges();
    });

    // recupération des enregistrements
    chrome.storage.local.get(['tuelloRecords'], results => {
      try {
        this.records = typeof results['tuelloRecords'] === 'string' ? JSON.parse(results['tuelloRecords']) : results['tuelloRecords'] || {};
      } catch (e) {
        this.records = {};
      }

      // paramétrage du jsoneditor
      this.initJsonEditor();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.refresh) {
        this.gererRefresh();
      }
      sendResponse();
    });
  }

  ngOnDestroy(): void {
    if (this.jsonEditorTree) {
      this.jsonEditorTree.destroy();
    }
  }



  refresh() {
    // recupération des enregistrements
    chrome.storage.local.get(['tuelloRecords'], results => {
      try {
        this.records = typeof results['tuelloRecords'] === 'string' ? JSON.parse(results['tuelloRecords']) : results['tuelloRecords'] || {}
        this.jsonEditorTree?.update({ json: this.records });
      } catch (e) {
        this.jsonEditorTree?.update({ json: {} });
      }
    });
  }


  gererRefresh() {
    // Mettre à jour le tampon avec le timestamp actuel
    this.dernierEvenementTampon = Date.now();

    // Attendre 300ms avant de traiter l'événement
    setTimeout(() => {
      // Vérifier si aucun nouvel événement n'a été déclenché pendant le délai
      if (Date.now() - this.dernierEvenementTampon >= 300) {
        this.refresh();
      }
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
      mode: "tree",  // Modes disponibles : "tree", "text", "view"
      indentation: 2, // Indentation pour le mode code
      mainMenuBar: true, // Afficher la barre d'outils
      navigationBar: true, // Activer la navigation JSON
      readOnly: false, // Permettre l'édition
      statusBar: false, // Afficher la barre de statut
    };


    // init du jsoneditor
    this.jsonEditorTree = createJSONEditor({
      target: document.getElementById('jsonEditorTree'),
      props: {
        content: { json: {} },
        options,
        onRenderMenu: (items, context) => items.filter(item =>
          !item.text && item.type !== 'separator' && item.className !== "jse-transform"
        ),
        onClassName: function (path, value) {
          if (path[path.length - 1] === 'httpCode') {
            if (value.toString().startsWith('5')) {
              return "server-error-http-response";
            }
            if (value.toString().startsWith('4')) {
              return "client-error-http-response";
            }
            return null;
          } else {
            return null;
          }

        },
        onChange: () => {
          console.log("onChange");
          this.updateData();
        },
        onRenderContextMenu: (items: ContextMenuItem[], context: RenderContextMenuContext) => {

          // On supprime le separator annsi que le bloc couper/copier/coller
          items.splice(1, 2);

          let menuClearResponse, menuAddTag;
          // 
          if (context.selection && context.selection['path'] && context.selection['path'][context.selection['path'].length - 1] === 'response') {
            menuClearResponse = {
              type: 'row',
              text: this.translate.instant('mmn.jsoneditor.menu.clearResponse'),
              title: this.translate.instant('mmn.jsoneditor.menu.clearResponse.title'),
              disabled: false,
              onClick: () => {
                const json = (this.jsonEditorTree.get() as JSONContent).json;
                if (json && Array.isArray(json)) {
                  const target = json[context.selection['path'][0]][context.selection['path'][1]];
                  json[context.selection['path'][0]][context.selection['path'][1]] = Array.isArray(target) ? [] : {};
                  this.jsonEditorTree.update({ json: json });
                  this.updateData();
                }
              }
            }
            menuAddTag = {
              type: 'row',
              text: this.translate.instant('mmn.jsoneditor.menu.addTag'),
              title: this.translate.instant('mmn.jsoneditor.menu.addTag.title'),
              disabled: false,
              onClick: () => {
                const json = (this.jsonEditorTree.get() as JSONContent).json;
                if (json && Array.isArray(json)) {
                  const api = json[context.selection['path'][0]];
                  const jsonKey = context.selection['path'][context.selection['path'].length - 1];
                  if (api) {
                    const element: TagElement = {
                      httpKey: api.key,
                      jsonKey: jsonKey,
                      display: jsonKey
                    }
                    this.tagsService.addTagElement(element);
                  }
                }
              }
            };
          }
          if (menuClearResponse) {
            items.push({ type: 'separator' });
            items.push(menuClearResponse);
            items.push(menuAddTag);

          }

          return items;

        }

      }
    });


    try {
      this.jsonEditorTree.update({ json: this.records });
    } catch (e) {
      this.jsonEditorTree.update({ json: {} });
    }
  }

  /**
   * Efface les enregistrements stockés dans le servcie recorderService et
   * vide le composant jsoneditor
   */
  effacerEnregistrements() {
    this.recorderService.reset();
    this.jsonEditorTree.update({ json: {} });
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
    chrome.runtime.sendMessage({
      action: 'HTTP_MOCK_STATE',
      value: this.httpMockActivated
    }, () => { });
    if (this.httpMockActivated) {
      chrome.runtime.sendMessage({
        action: 'HTTP_RECORD_STATE',
        value: false
      }, () => { });
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
    chrome.runtime.sendMessage({
      action: 'HTTP_RECORD_STATE',
      value: this.httpRecordActivated
    }, () => { });
    if (this.httpRecordActivated) {
      chrome.runtime.sendMessage({
        action: 'HTTP_MOCK_STATE',
        value: false
      }, () => { });
    }
  }

  /**
   * Permet de copier dans le presse-papier
   * Cette fonctionnalité sera rajouté dans le cdk en version 9.xs
   */
  copyToClipboard() {
    const el = document.createElement('textarea');
    try {
      const jsonData = this.jsonEditorTree.get() as JSONContent;
      el.value = JSON.stringify(jsonData.json);
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch (e) {
      // @TODO : a compléter
    }
  }

  /**
   * Permet de mettre à jour les données si le json est valide
   */
  updateData() {
    const jsonData = this.jsonEditorTree.get() as JSONContent;
    const jsonTxt = JSON.stringify(jsonData.json);
    if (jsonTxt) {
      this.recorderService.saveToLocalStorage(jsonTxt);
      chrome.runtime.sendMessage({
        action: 'MMA_RECORDS_CHANGE'
      }, () => { });
    } else {
      this.infoBar.open('Json invalide', '', {
        duration: 2000,
        verticalPosition: 'top',
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
    fileReader.onloadend = x => {
      jsonResult = fileReader.result as string;

      if (jsonResult && extension === 'json') {
        const data = this.replaceDynamicData(jsonResult);
        const dataJson = typeof data === 'string' ? JSON5.parse(data) : data || {};
        this.jsonEditorTree.update({ json: dataJson });
        this.updateData();
      } else {
        let data = this.extraireFluxJSON(jsonResult);
        data = this.replaceDynamicData(data);
       
        let jsonData = typeof data === 'string' ? JSON5.parse(data) : data || {};

        //on remplace la donnée dynamique window.location.origin pour pouvoir l'importer dans jsoneditor
        this.jsonEditorTree.update({ json: jsonData });
        this.updateData();
      }
      this.snackBar.open(
        this.translate.instant('mmn.spy-http.import.message'),
        this.translate.instant('mmn.spy-http.import.success.action'),
        { duration: 2000 },
      );
    };
    fileReader.onerror = event => {
      this.snackBar.open(
        this.translate.instant('mmn.spy-http.import.message'),
        this.translate.instant('mmn.spy-http.import.error.action'),
        { duration: 2000 },
      );
      fileReader.abort();
    };
    fileReader.readAsText(file);
  }

  replaceDynamicData(data) {
    let ret = data.replace(/window.location.origin \+ "/g, '"###window.location.origin### ');
    ret = ret.replace(/window.location.origin \+ '/g, "'###window.location.origin### ");
    return ret;
  }

  selectFile() {
    this.fileInput.nativeElement.click();
    this.fileInput.nativeElement.value = ''; // permet de permettre le onchange si on reselectionne le meme fichier
  }

  addTags() {
    this.router.navigateByUrl('/recorder/tags', { skipLocationChange: true });
  }

  openSettings() {
    const dialogRef = this.dialog.open(RecorderHttpSettingsComponent);
  }
  // Fonction pour extraire le flux JSON du code JavaScript
  private extraireFluxJSON(codeJS) {
    // Recherche de la déclaration de la variable contenant le flux JSON
    let regex = /window.tuelloRecords\s*=\s*(.*?); \/\/#ENDOFJSON#/s;

    let match = codeJS.match(regex);
    if (!match) {
      regex = /window\['tuelloRecords'\]\s*=\s*(.*?); \/\/#ENDOFJSON#/s;
      match = codeJS.match(regex);
    }

    if (match && match[1]) {
      // Si la correspondance est trouvée, analysez la chaîne JSON et renvoyez l'objet JavaScript
      return match[1];
    } else {
      console.error('Tuello: Variable contenant le flux JSON non trouvée');
      return null;
    }
  }

}
