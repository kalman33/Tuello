import { Action } from '../../../src/app/spy-http/models/Action';
import { ActionType } from '../../../src/app/spy-http/models/ActionType';
import { Record } from '../../../src/app/spy-http/models/Record';
import { WindowSize } from '../../../src/app/spy-http/models/WindowSize';
import { HttpReturn } from '../../../src/app/recorder-http/models/http.return';
import { removeDuplicateEntries } from '../utils/utils';
import { IFrame } from '../models/IFrame';
import { IUserAction } from '../../../src/app/spy-http/models/UserAction';

let lastAction: Action;
let last;
let record: Record;
let pause = false;



export function setPause(val: boolean) {
  pause = val;
}

export function addRecordByImage(userAction: IUserAction, tabId: number, frameId: number) {
  const now = Date.now();
  const delay = isNaN(now - last) ? 0 : now - last;
  if (userAction.frame && userAction.frame.frameIndex !== undefined) {
    // on est dans le cas devtools
    const action = new Action(delay, ActionType.RECORD_BY_IMAGE, userAction);
    record.actions.push(action);
    last = now;
    record.last = last;
    saveUiRecordToLocalStorage();
  } else {
    getSrcFromFrameId(tabId, frameId)
      .then(iframe => {
        userAction.frame = iframe;
      })
      .then(() => {
        const action = new Action(delay, ActionType.RECORD_BY_IMAGE, userAction);
        record.actions.push(action);
        last = now;
        record.last = last;
        saveUiRecordToLocalStorage();
      });
  }
}

export function addNavigate(userAction: IUserAction, tabId: number, frameId: number) {
  const now = Date.now();
  const delay = isNaN(now - last) ? 0 : now - last;

  getSrcFromFrameId(tabId, frameId)
    .then(iframe => {
      userAction.frame = iframe;
    })
    .then(() => {
      const action = new Action(delay, ActionType.NAVIGATE, userAction);
      record.actions.push(action);
      last = now;
      record.last = last;
      saveUiRecordToLocalStorage();
    });
}

export function addUserAction(userAction: IUserAction, tabId: number, frameId: number) {
  if (!pause) {
    const now = Date.now();
    const delay = isNaN(now - last) ? 0 : now - last;
    const action = new Action(delay, ActionType.EVENT, userAction);

    if (!record) {
      record = new Record();
      record.actions = [];
      lastAction = null;
    }

    if (userAction.frame && userAction.frame.frameIndex !== undefined) {
      // on est dans le cas d'une iframe hors devtools
      switch (userAction.type) {
        case 'scroll':
          if (
            lastAction &&
            lastAction.userAction &&
            lastAction.userAction.type === userAction.type &&
            lastAction.userAction.frame.frameId === userAction.frame.frameId
          ) {
            lastAction.userAction.scrollX = userAction.scrollX;
            lastAction.userAction.scrollY = userAction.scrollY;
            // on rajoute le delay
            lastAction.delay = lastAction.delay + delay;
          } else {
            record.actions.push(action);
            lastAction = action;
          }
          break;
        case 'input':
          if (
            lastAction &&
            lastAction.userAction &&
            lastAction.userAction.type === userAction.type &&
            lastAction.userAction.frame.frameId === userAction.frame.frameId
          ) {
            lastAction.userAction.value = userAction.value;
          } else {
            record.actions.push(action);
            lastAction = action;
          }
          break;
        case 'resize':
          chrome.windows.getCurrent((windowInfos) => {
            let htmlCoordinates = {
              width: windowInfos.width,
              height: windowInfos.height,
              top: windowInfos.top,
              left: windowInfos.left
            };
            if (
              lastAction &&
              lastAction.userAction &&
              lastAction.userAction.type === userAction.type &&
              lastAction.userAction.frame.frameId === userAction.frame.frameId
            ) {
              lastAction.userAction.htmlCoordinates = htmlCoordinates;
            } else {
              action.userAction.htmlCoordinates = htmlCoordinates;
              record.actions.push(action);
              lastAction = action;
            }
          });
          break;
        default:
          record.actions.push(action);
          lastAction = action;
          break;
      }
      last = now;
      record.last = last;
      saveUiRecordToLocalStorage();
    } else {
      getSrcFromFrameId(tabId, frameId)
        .then(iframe => {
          userAction.frame = iframe;
        })
        .then(() => {
          switch (userAction.type) {
            case 'scroll':
              if (
                lastAction &&
                lastAction.userAction &&
                lastAction.userAction.type === userAction.type &&
                lastAction.userAction.frame.frameId === frameId
              ) {
                lastAction.userAction.scrollX = userAction.scrollX;
                lastAction.userAction.scrollY = userAction.scrollY;
                // on rajoute le delay
                lastAction.delay = lastAction.delay + delay;
              } else {
                record.actions.push(action);
                lastAction = action;
              }
              break;
            case 'input':
              if (
                lastAction &&
                lastAction.userAction &&
                lastAction.userAction.type === userAction.type &&
                lastAction.userAction.frame.frameId === frameId
              ) {
                lastAction.userAction.value = userAction.value;
              } else {
                record.actions.push(action);
                lastAction = action;
              }
              break;
            case 'resize':
              chrome.windows.getCurrent((windowInfos) => {
                let htmlCoordinates = {
                  width: windowInfos.width,
                  height: windowInfos.height,
                  top: windowInfos.top,
                  left: windowInfos.left
                };
                if (
                  lastAction &&
                  lastAction.userAction &&
                  lastAction.userAction.type === userAction.type &&
                  lastAction.userAction.frame.frameId === userAction.frame.frameId
                ) {
                  lastAction.userAction.htmlCoordinates = htmlCoordinates;
                } else {
                  action.userAction.htmlCoordinates = htmlCoordinates;
                  record.actions.push(action);
                  lastAction = action;
                }
              });
              break;
            default:
              record.actions.push(action);
              lastAction = action;
              break;
          }
          last = now;
          record.last = last;
          saveUiRecordToLocalStorage();
        });
    }
  }
}

export function addScreenShot(tabId, isPopupVisible: boolean) {
  return new Promise(resolve => {
    if (!record) {
      record = new Record();
      lastAction = null;
    }
    if (isPopupVisible) {
      chrome.tabs.sendMessage(tabId, {
        action: 'HIDE'
      }, {
        frameId: 0
      }, () => { });
    }
    chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "png" }, imgData => {
      const now = Date.now();
      const delay = isNaN(now - last) ? 0 : now - last;

      const action = new Action(delay, ActionType.SCREENSHOT, null, imgData);

      record.actions.push(action);
      lastAction = action;
      last = now;
      if (isPopupVisible) {
        chrome.tabs.sendMessage(tabId, {
          action: 'SHOW'
        }, {
          frameId: 0
        }, () => { });
      }
      saveUiRecordToLocalStorage();
      resolve(true);
    });
  });
}

export function addComment(comment: string) {

  const now = Date.now();
  const delay = isNaN(now - last) ? 0 : now - last;

  const action = new Action(delay, ActionType.COMMENT, null, comment);

  record.actions.push(action);
  lastAction = action;
  last = now;
  saveUiRecordToLocalStorage();
}

export function addRecordWindowSize(windowSize: WindowSize) {
  if (!record) {
    record = new Record(windowSize);
    lastAction = null;
  } else {
    record.windowSize = windowSize;
  }
}

export function addHttpUserAction(data: HttpReturn) {
  if (!record) {
    record = new Record();
    lastAction = null;
  }
  if (!record.httpRecords) {
    record.httpRecords = [];
  }

  record.httpRecords.unshift(data);
  record.httpRecords = removeDuplicateEntries(record.httpRecords);

  saveUiRecordToLocalStorage();
}

export function loadRecordFromStorage() {
  chrome.storage.local.get(['uiRecord'], results => {
    if (results.uiRecord) {
      const data = results.uiRecord;
      record = new Record(data.windowSize);
      record.actions = data.actions;
      record.httpRecords = data.httpRecords;
      lastAction = data.actions && data.actions.length ? data.actions[data.actions.length - 1] : null;
      last = data.last;
    } else {
      last = Date.now();
    }
  });
}

export function deleteRecord() {
  record = null;
  lastAction = null;
  chrome.storage.local.remove(['uiRecord']);
}

export function getFrameIdFromSrc(tabId, src: string): Promise<IFrame> {
  return new Promise((resolve, reject) => {
    chrome.webNavigation.getAllFrames(
      {
        tabId
      },
      frames => {
        for (const frame of frames) {
          if (frame.url === src) {
            // const iframe =
            resolve({
              src: frame.url,
              frameId: frame.frameId
            });
          }
        }
        reject('frame non trouvé');
      }
    );
  });
}

export function getSrcFromFrameId(tabId, frameId: number): Promise<IFrame> {
  return new Promise((resolve, reject) => {
    chrome.webNavigation.getAllFrames(
      {
        tabId
      },
      frames => {
        for (const frame of frames) {
          if (frame.frameId === frameId) {
            // const iframe =
            resolve({
              src: frame.url,
              frameId: frame.frameId
            });
          }
        }
        reject('frame non trouvé');
      }
    );
  });
}

function saveUiRecordToLocalStorage() {
  chrome.storage.local.set({ uiRecord: record });

  chrome.runtime.sendMessage({
    action: 'UI_RECORD_CHANGED',
    value: record
  }, () => { });


}
