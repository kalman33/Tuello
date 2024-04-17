import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { fadeInAnimation } from '../../core/animations/fadeInAnimation';
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../core/animations/route.animations';
import { TagElement } from '../models/TagElement';
import { TagsService } from '../services/tags.service';

@Component({
  selector: 'mmn-add-tags',
  templateUrl: './add-tags.component.html',
  styleUrls: ['./add-tags.component.scss'],
  animations: [fadeInAnimation]
})
export class AddTagsComponent implements OnInit {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS;

  httpKey: string;
  jsonKey: string;
  display: string
  dataLoaded: boolean = false;

  constructor(
    private translate: TranslateService,
    private router: Router,
    public tagsService: TagsService,
    private changeDetectorRef: ChangeDetectorRef

  ) {
  }

 
  async ngOnInit() {
    this.tagsService.elements = await this.getDataFromChromeStorage();
    this.dataLoaded = true;
  }

  getDataFromChromeStorage(): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['tuelloHTTPTags'], result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result['tuelloHTTPTags']);
        }
      });
    });
  }

  trackByFn(index:number, item: TagElement) {
    item.display;
  }
    
  addElement() {
    if (this.httpKey && this.jsonKey) {
      const element: TagElement = {
        httpKey: this.httpKey,
        jsonKey: this.jsonKey,
        display: this.display || '?'
      }
      this.tagsService.addTagElement(element);
    }
  }

  public onChange(): void {
    this.tagsService.updateData();
  }

  /**
   * Suppression d'un element
   */
  deleteElement(index: number) {
    this.tagsService.deleteElement(index);
  }

  back() {
    this.router.navigateByUrl('/recorder', { skipLocationChange: true });
  }

}
