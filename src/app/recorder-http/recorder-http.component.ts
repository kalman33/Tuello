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
import { Content, createJSONEditor, JSONContent, JsonEditor, RenderValueProps } from 'vanilla-jsoneditor'
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ExportComponent } from './export/export.component';
import { TagElement } from './models/TagElement';
import { RecorderHttpService } from './services/recorder-http.service';
import { TagsService } from './services/tags.service';
import { RecorderHttpSettingsComponent } from './settings/recorder-http-settings.component';

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
        this.records = JSON.parse(results['tuelloRecords']);
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
        this.records = JSON.parse(results['tuelloRecords']);
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

    //const clearResponse = this.translate.instant('mmn.jsoneditor.menu.clearResponse');
    //const clearResponseTitle = this.translate.instant('mmn.jsoneditor.menu.clearResponse.title');

    // options du jsoneditor
    // this.options = {

    //   mode: 'tree',
    //   enableSort: false,
    //   enableTransform: false,
    //   language: this.translate.instant('mmn.jsoneditor.language') || 'en',
    //   ajv: null,
    //   history: false,
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
    //   },
    //   onChange: () => {
    //     this.updateData();
    //   },
    //   onNodeName: params => {
    //     const { path, type, size } = params;
    //     if (type === 'object' && path && path.length === 1 && size > 0) {
    //       return this.jsonEditorTree.get()[path[0]].key;
    //     }
    //   },
    //   onClassName: ({ path, field, value }) => {
    //     if (value && value.httpCode && value.httpCode.toString().startsWith('5')) {
    //       return "server-error-http-response";
    //     }
    //     if (value && value.httpCode && value.httpCode.toString().startsWith('4')) {
    //       return "client-error-http-response";
    //     }
    //     return "no-error-http-response";
    //   },
    //   onCreateMenu: (items, node) => {
    //     const path = node.path

    //     // log the current items and node for inspection

    //     if (path && node && node.path[1] === 'response') {
    //       items.push({
    //         text: this.translate.instant('mmn.jsoneditor.menu.clearResponse'),
    //         title: this.translate.instant('mmn.jsoneditor.menu.clearResponse.title'),
    //         className: 'example-class',
    //         click: () => {
    //           const json = this.jsonEditorTree.get();
    //           if (json && Array.isArray(json)) {

    //             if (json[node.path[0]][node.path[1]]) {
    //               if (Array.isArray(json[node.path[0]][node.path[1]])) {
    //                 json[node.path[0]][node.path[1]] = [];
    //               } else {
    //                 json[node.path[0]][node.path[1]] = {};
    //               }
    //               this.jsonEditorTree.update(json);
    //               this.updateData();
    //             }
    //           }
    //         }
    //       });
    //       items.push({
    //         text: this.translate.instant('mmn.jsoneditor.menu.addTag'),
    //         title: this.translate.instant('mmn.jsoneditor.menu.addTag.title'),
    //         className: 'example-class',
    //         click: () => {
    //           const json = this.jsonEditorTree.get();
    //           if (json && Array.isArray(json)) {
    //             const api = json[node.path[0]];
    //             const jsonKey = path.pop();
    //             if (api) {
    //               const element: TagElement = {
    //                 httpKey: api.key,
    //                 jsonKey: jsonKey,
    //                 display: jsonKey
    //               }
    //               this.tagsService.addTagElement(element);
    //             }
    //           }
    //         }
    //       });
    //     }
    //     items = items.filter(function (item) {
    //       // on supprime separator, type et Extract
    //       return item.type !== 'separator' && item.text !== 'Type' && item.text !== 'Extract'
    //     })

    //     // finally we need to return the items array. If we don't, the menu
    //     // will be empty.
    //     return items

    //   }
    // };
    let options = {
      mode: "tree",  // Modes disponibles : "tree", "text", "view"
      indentation: 2, // Indentation pour le mode code
      mainMenuBar: true, // Afficher la barre d'outils
      navigationBar: true, // Activer la navigation JSON
      readOnly: false, // Permettre l'édition
    };


    // init du jsoneditor
    //this.jsonEditorTree = new JSONEditor(document.getElementById('jsonEditorTree'), this.options);

    this.jsonEditorTree = createJSONEditor({
      target: document.getElementById('jsonEditorTree'),
      props: {
        content: { json: {} },
        options,
        onRenderMenu: (items, context) => items.filter(item =>
          !item.text && item.type !== 'separator' && item.className !== "jse-transform"
        ),
        onClassName: function (path, schema) {
          // Exemple : changer la couleur en fonction de la valeur
          //const value = path.reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : null,  this.jsonEditorTree.editor.get());
        const  value = 'error';
          if (value === 'error') {
              return 'highlight-red';
          } else if (value === 'success') {
              return 'highlight-green';
          }
          return '';
      }
      
        // onChange: () => {
        //   this.updateData();
        // }
       
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

        const dataJson = JSON.parse(this.replaceDynamicData(jsonResult));
        this.jsonEditorTree.update({ json: dataJson });
        this.updateData();
      } else {
        let jsonData = JSON.parse(this.extraireFluxJSON(jsonResult));

        //on remplace la donnée dynamique window.location.origin pour pouvoir l'importer dans jsoneditor
        this.jsonEditorTree.update({ json: this.replaceDynamicData(jsonData) });
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
