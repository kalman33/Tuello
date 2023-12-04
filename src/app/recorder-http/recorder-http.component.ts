import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import JSONEditor from 'jsoneditor';
import { RecorderHttpService } from './services/recorder-http.service';
import { TranslateService } from '@ngx-translate/core';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../core/animations/route.animations';
import { ExportComponent } from './export/export.component';

@Component({
  selector: 'mmn-recorder-http',
  templateUrl: './recorder-http.component.html',
  styleUrls: ['./recorder-http.component.scss'],
})
export class RecorderHttpComponent implements OnInit {
  constructor(
    private dialog: MatDialog,
    private infoBar: MatSnackBar,
    private recorderService: RecorderHttpService,
    private translate: TranslateService,
    private ref: ChangeDetectorRef,
    private snackBar: MatSnackBar,
  ) { }

  @ViewChild('fileInput') fileInput: ElementRef;

  // Json Editor
  options: any;
  jsonEditorTree: any;

  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  httpMockActivated: boolean;
  httpRecordActivated: boolean;

  records;

  ngOnInit() {
    chrome.storage.local.get(['httpMock', 'httpRecord'], results => {
      this.httpRecordActivated = results['httpRecord'];
      this.httpMockActivated = results['httpMock'];
      this.ref.detectChanges();
    });

    // recupération des enregistrements
    chrome.storage.local.get(['mmaRecords'], results => {
      this.records = results['mmaRecords'];
      // paramétrage du jsoneditor
      this.initJsonEditor();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.refresh) {
        // recupération des enregistrements
        chrome.storage.local.get(['mmaRecords'], results => {
          this.records = results['mmaRecords'];
          this.jsonEditorTree.setText(JSON.stringify(results['mmaRecords']));
        });
      }
      sendResponse();
    });
  }

  /**
   * initialisation du jsoneditor
   */
  private initJsonEditor() {

    //const clearResponse = this.translate.instant('mmn.jsoneditor.menu.clearResponse');
    //const clearResponseTitle = this.translate.instant('mmn.jsoneditor.menu.clearResponse.title');

    // options du jsoneditor
    this.options = {

      mode: 'tree',
      enableSort: false,
      enableTransform: false,
      language: this.translate.instant('mmn.jsoneditor.language') || 'en',
      onValidationError: errors => {
        errors.forEach(error => {
          switch (error.type) {
            case 'validation': // schema validation error
              this.infoBar.open('Format json invalide', '', {
                duration: 2000,
                verticalPosition: 'bottom',
              });
              break;
            case 'customValidation': // custom validation error
              this.infoBar.open('Format json invalide', '', {
                duration: 2000,
                verticalPosition: 'bottom',
              });
              break;
            case 'error': // json parse error
              this.infoBar.open('Json invalide', '', {
                duration: 2000,
                verticalPosition: 'bottom',
              });
              break;
          }
        });
      },
      onChange: () => {
        this.updateData();
      },
      onNodeName: params => {
        const { path, type, size } = params;
        if (type === 'object' && path && path.length === 1 && size > 0) {
          return this.jsonEditorTree.get()[path[0]].key;
        }
      },
      onClassName: ({ path, field, value }) => {
        if (value && value.httpCode && value.httpCode.toString().startsWith('5')) {
          return "server-error-http-response";
        }
        if (value && value.httpCode && value.httpCode.toString().startsWith('4')) {
          return "client-error-http-response";
        }
        return "no-error-http-response";
      },
      onCreateMenu: (items, node) => {
        const path = node.path

        // log the current items and node for inspection
        // console.log('items:', items, 'node:', node);

        if (path && node && node.path[1] === 'reponse') {
          items.push({
            text: this.translate.instant('mmn.jsoneditor.menu.clearResponse'),
            title: this.translate.instant('mmn.jsoneditor.menu.clearResponse.title'),
            className: 'example-class',
            click: () => {
              const json = this.jsonEditorTree.get();
              if (json && Array.isArray(json)) {

                if (json[node.path[0]][node.path[1]]) {
                  if (Array.isArray(json[node.path[0]][node.path[1]])) {
                    json[node.path[0]][node.path[1]] = [];
                  } else {
                    json[node.path[0]][node.path[1]] = {};
                  }
                  this.jsonEditorTree.update(json);
                  this.updateData();
                }
              }
            }
          })
        }
        items = items.filter(function (item) {
          // on supprime separator, type et Extract
          return item.type !== 'separator' && item.text !== 'Type' && item.text !== 'Extract'
        })

        // finally we need to return the items array. If we don't, the menu
        // will be empty.
        return items

      }
    };

    // init du jsoneditor
    this.jsonEditorTree = new JSONEditor(document.getElementById('jsonEditorTree'), this.options);

    try {
      this.jsonEditorTree.setText(JSON.stringify(this.records));
    } catch (e) {
      this.jsonEditorTree.setText('{}');
    }
  }

  /**
   * Efface les enregistrements stockés dans le servcie recorderService et
   * vide le composant jsoneditor
   */
  effacerEnregistrements() {
    this.recorderService.reset();
    this.jsonEditorTree.set({});
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
  }

  /**
   * Permet de copier dans le presse-papier
   * Cette fonctionnalité sera rajouté dans le cdk en version 9.xs
   */
  copyToClipboard() {
    const el = document.createElement('textarea');
    el.value = this.jsonEditorTree.getText();
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }

  /**
   * Permet de mettre à jour les données si le json est valide
   */
  updateData() {
    const json = this.jsonEditorTree.get();
    if (json) {
      this.recorderService.saveToLocalStorage(json);
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
    const dialogRef = this.dialog.open(ExportComponent, {
      data: this.jsonEditorTree.getText()
    });
  }

  public onChange(fileList: any): void {
    const file = fileList.target.files[0];
    const fileReader: FileReader = new FileReader();
    let jsonResult = '';
    fileReader.onloadend = x => {
      jsonResult = fileReader.result as string;
      this.snackBar.open(
        this.translate.instant('mmn.spy-http.import.message'),
        this.translate.instant('mmn.spy-http.import.success.action'),
        { duration: 2000 },
      );
      if (jsonResult) {
        try {
          JSON.stringify(jsonResult);
        } catch (e) {
          jsonResult = JSON.parse(jsonResult);
        }
        this.jsonEditorTree.setText(jsonResult);
        this.updateData();
      }
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

  selectFile() {
    this.fileInput.nativeElement.click();
    this.fileInput.nativeElement.value = ''; // permet de permettre le onchange si on reselectionne le meme fichier
  }

}
