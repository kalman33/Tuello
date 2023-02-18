import {Injectable} from '@angular/core';
import {Action} from '../models/Action';
import {from, Observable, of} from 'rxjs';
import {concatMap, delay} from 'rxjs/operators';
import {IUserAction} from '../models/UserAction';
import {ComparisonResult} from '../models/ComparisonResult';
import resemble from 'resemblejs';

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
    });
  }

  public takeScreenshot(action: Action): Observable<any> {
    if (!this.comparisonResults) {
      this.comparisonResults = [];
    }
    return new Observable<any>(observer => {
      chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, imgData => {
        resemble(action.data)
          .compareTo(imgData)
          .onComplete(data => {
            this.comparisonResults.push(new ComparisonResult(action.id, action.data, imgData, data));
            observer.next({actionType: 'SCREENSHOT'});
            observer.complete();
          });
      })
    });
  }
}
