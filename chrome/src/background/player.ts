import { Action } from '../../../src/app/spy-http/models/Action';
import { ComparisonResult } from '../models/ComparisonResult';
import { IFrame } from '../models/IFrame';
import { getFrameIdFromSrc } from './uiRecorderHandler';
import resemble from 'resemblejs';
import { UserAction } from '../models/UserAction';

export class Player {
  yieldActions: Generator<Action>;
  initialActions: Action[];
  timeoutId;
  pauseCurrentAction = false;
  chromeTabId: number;
  count = 0;
  comparisonResults: ComparisonResult[];

  constructor(actions: Action[], chromeTabId: number, senderResponse: (response?: any) => void) {
    this.initialActions = actions;
    this.chromeTabId = chromeTabId;
    this.yieldActions = this.iterateGenerator(actions);
  }

  private startTimeout() {
    if (this.initialActions && this.initialActions[this.count] && this.initialActions[this.count].delay) {
      this.timeoutId = setTimeout(this.treatAction.bind(this), this.initialActions[this.count].delay);
    }
  }

  async treatAction() {
    
    const action = this.yieldActions.next();
    this.count++;
    const userAction = action.value ? action.value.userAction : null;
    if (action.done) {
      clearTimeout(this.timeoutId);
      this.count = 0;

      // on envoie un message au content scrip
      chrome.tabs.sendMessage(this.chromeTabId, {
        action: 'ACTIONS_RESULTS',
        value: { comparisonResults: this.comparisonResults }
      }, {
        frameId: 0
      });
    } else {
      if (action.value.actionType === 'SCREENSHOT') {
        if (!this.comparisonResults) {
          this.comparisonResults = [];
        }
        await this.compareImage(action.value);
      } else if (action.value.actionType !== 'COMMENT') {
        let frame: IFrame;

        // on regarde à quelle iframe (donc au bon content script) on doit envoyer la demande de play
        if (userAction.frame && userAction.frame.src && userAction.frame.frameId > 0) {
          await getFrameIdFromSrc(this.chromeTabId, userAction.frame.src).then(async iframe => {
            frame = iframe;
            const options = iframe
              ? {
                  frameId: iframe.frameId
                }
              : {};
            // on envoie un message au bon content scrip
            await this.sendMessageToContent(userAction, options);
          });
        } else {
          // on envoie un message au bon content scrip
          await this.sendMessageToContent(userAction, {
            frameId: 0
          });
        }
      }

      this.timeoutId = setTimeout(
        this.treatAction.bind(this),
        this.initialActions[this.count] ? this.initialActions[this.count].delay : this.initialActions[this.count - 1].delay
      );
    }
  }

  *iterateGenerator(actions: Action[]) {
    for (const action of actions) {
      yield action;
    }
  }

  launchAction(state) {
    switch (state) {
      case 'PLAY':
        this.pauseCurrentAction = false;
        this.startTimeout();
        break;
      case 'PAUSE':
        this.pauseCurrentAction = true;
        clearTimeout(this.timeoutId);
        break;
      case 'RESET':
        this.pauseCurrentAction = false;
        this.yieldActions = this.iterateGenerator(this.initialActions);
        clearTimeout(this.timeoutId);
        break;
      default:
        this.pauseCurrentAction = false;
        this.startTimeout();
        break;
    }
    return this.count;
  }

   sendMessageToContent(userAction: UserAction, options?: chrome.tabs.MessageSendOptions): Promise<any> {
    return new Promise((resolve, reject) => {

      if (userAction.type === 'resize') {
        chrome.windows.getCurrent((window) => {
          let updateInfo = {
            width: userAction.htmlCoordinates.width,
            height: userAction.htmlCoordinates.height,
            top: userAction.htmlCoordinates.top,
            left: userAction.htmlCoordinates.left
          };
          ((updateInfo as any).state = "normal"), chrome.windows.update(window.id, updateInfo,
            () =>
              resolve(true)
          );
        });
      } else {
        chrome.tabs.sendMessage(
          this.chromeTabId,
          {
            action: 'PLAY_USER_ACTION',
            value: userAction
          },
          options,
          (response: any) => {
            resolve(true);
          }
        );
      }
    });
  }

  compareImage(action: Action): Promise<any> {
    return new Promise ((resolve, reject) => {
      chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, imgData => {
        resemble(action.data)
          .compareTo(imgData)
          .onComplete(data => {
            this.comparisonResults.push(new ComparisonResult(action.id, action.data, imgData, data));
            resolve(true);
          });
      });
    });
  }
}
