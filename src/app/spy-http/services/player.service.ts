import { Injectable } from '@angular/core';
import { Buffer } from 'buffer';
import pixelmatch from "pixelmatch";
import { PNG } from 'pngjs/browser';
import { from, Observable, of } from 'rxjs';
import { concatMap, delay } from 'rxjs/operators';
import { Action } from '../models/Action';
import { ComparisonResult } from '../models/ComparisonResult';
import { IUserAction } from '../models/UserAction';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  public comparisonResults: ComparisonResult[];
  public pausedActionNumber = 0;

  constructor() {
  }

  /**
   * renvoit un flux d'action espacé dans le temps en fonction du delay
   * @param actions Action[]
   */
  public getScheduledActions(actions: Action[]): Observable<Action> {
    const obsActions = from(actions);

    return obsActions.pipe(
      concatMap(action => {
        if (action.actionType === 'SCREENSHOT') {
          // @TODO : faudrait supprimer ce delay de 1000
          return of({}).pipe(delay(1000), concatMap(() => this.takeScreenshot(action).pipe(delay(action.delay))));
        } else {
          return of(action).pipe(delay(action.delay));
        }
      }),
    );
  }

  public playUserAction(action: IUserAction) {
    chrome.runtime.sendMessage({
      action: 'PLAY_USER_ACTION',
      value: action,
    }, ()=>{});
  }

  public takeScreenshot(action: Action): Observable<any> {
    if (!this.comparisonResults) {
      this.comparisonResults = [];
    }
    return new Observable<any>(observer => {
      chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "png" }, imgData => {
        let pngImgData = PNG.sync.read(Buffer.from(action.data.slice('data:image/png;base64,'.length), 'base64'));
        let pngImgData1 = PNG.sync.read(Buffer.from(imgData.slice('data:image/png;base64,'.length), 'base64'));
        let diffImage = new PNG({
          width: pngImgData.width,
          height: pngImgData.height
        });

        // pixelmatch returns the number of mismatched pixels
        const mismatchedPixels = pixelmatch(
          pngImgData.data,
          pngImgData1.data,
          diffImage.data, // output
          pngImgData.width,
          pngImgData.height,
          {} // options
        );

        const match = 1 - mismatchedPixels / (pngImgData.width * pngImgData.height);
        const misMatchPercentage = 100 - (match * 100)

        diffImage.pack();
        var chunks = [];
        diffImage.on('data', (chunk) => {
          chunks.push(chunk);
          console.log('chunk:', chunk.length);
        });
        diffImage.on('end', () => {
          var result = Buffer.concat(chunks);
          const data = {
            misMatchPercentage,
            imageDataUrl: 'data:image/png;base64,' + result.toString('base64')
          };

          this.comparisonResults.push(new ComparisonResult(action.id, action.data, imgData, data));
          observer.next({actionType: 'SCREENSHOT'});
            observer.complete();

        });
      });
    });
  }
}
