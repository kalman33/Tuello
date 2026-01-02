import { Action } from '../../../src/app/spy-http/models/Action';
import { ActionType } from '../../../src/app/spy-http/models/ActionType';
import { Record } from '../../../src/app/spy-http/models/Record';
import { WindowSize } from '../../../src/app/spy-http/models/WindowSize';
import { HttpReturn } from '../../../src/app/recorder-http/models/http.return';
import { removeDuplicateEntries } from '../utils/utils';
import { IFrame } from '../models/IFrame';
import { IUserAction } from '../../../src/app/spy-http/models/UserAction';
import { saveCompressed, loadCompressed } from '../utils/compression';

/** État d'enregistrement isolé par onglet */
interface RecordingState {
  lastAction: Action | null;
  last: number;
  record: Record | null;
  pause: boolean;
}

/** Map des états d'enregistrement par tabId */
const recordingStates = new Map<number, RecordingState>();

/** Onglet actif actuel (pour la compatibilité avec le stockage unique) */
let activeTabId: number | null = null;

/**
 * Récupère ou crée l'état d'enregistrement pour un onglet
 */
function getState(tabId?: number): RecordingState {
  const id = tabId ?? activeTabId ?? 0;
  if (!recordingStates.has(id)) {
    recordingStates.set(id, {
      lastAction: null,
      last: Date.now(),
      record: null,
      pause: false
    });
  }
  return recordingStates.get(id)!;
}

/**
 * Définit l'onglet actif pour l'enregistrement
 */
export function setActiveTab(tabId: number): void {
  activeTabId = tabId;
}

/**
 * Nettoie l'état d'un onglet fermé
 */
export function cleanupTabState(tabId: number): void {
  recordingStates.delete(tabId);
}


export function initRecord(tabId?: number): void {
  const state = getState(tabId);
  state.last = Date.now();
}

export function setPause(val: boolean, tabId?: number): void {
  const state = getState(tabId);
  state.pause = val;
}

export function addRecordByImage(userAction: IUserAction, tabId: number, frameId: number): void {
  const state = getState(tabId);
  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
  }

  if (userAction.frame && userAction.frame.frameIndex !== undefined) {
    // on est dans le cas devtools
    const action = new Action(delay, ActionType.RECORD_BY_IMAGE, userAction);
    state.record.actions.push(action);
    state.last = now;
    state.record.last = state.last;
    saveUiRecordToLocalStorage(state.record);
  } else {
    getSrcFromFrameId(tabId, frameId)
      .then(iframe => {
        userAction.frame = iframe;
      })
      .then(() => {
        const action = new Action(delay, ActionType.RECORD_BY_IMAGE, userAction);
        state.record!.actions.push(action);
        state.last = now;
        state.record!.last = state.last;
        saveUiRecordToLocalStorage(state.record!);
      });
  }
}

export function addNavigate(userAction: IUserAction, tabId: number, frameId: number): void {
  const state = getState(tabId);
  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
  }

  getSrcFromFrameId(tabId, frameId)
    .then(iframe => {
      userAction.frame = iframe;
    })
    .then(() => {
      const action = new Action(delay, ActionType.NAVIGATE, userAction);
      if (state.record?.actions?.length === 0) {
        state.record.actions.push(action);
      } else {
        state.record!.actions.unshift(action);
      }
      state.last = now;
      state.record!.last = state.last;
      saveUiRecordToLocalStorage(state.record!);
    });
}

export function addUserAction(userAction: IUserAction, tabId: number, frameId: number): void {
  const state = getState(tabId);

  if (state.pause) {
    return;
  }

  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;
  const action = new Action(delay, ActionType.EVENT, userAction);

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
    state.lastAction = null;
  }

  /**
   * Traite une action selon son type avec déduplication
   */
  const processAction = (compareFrameId: number): void => {
    switch (userAction.type) {
      case 'scroll':
        if (
          state.lastAction &&
          state.lastAction.userAction &&
          state.lastAction.userAction.type === userAction.type &&
          state.lastAction.userAction.frame?.frameId === compareFrameId
        ) {
          state.lastAction.userAction.scrollX = userAction.scrollX;
          state.lastAction.userAction.scrollY = userAction.scrollY;
          state.lastAction.delay = state.lastAction.delay + delay;
        } else {
          state.record!.actions.push(action);
          state.lastAction = action;
        }
        break;
      case 'input':
        if (
          state.lastAction &&
          state.lastAction.userAction &&
          state.lastAction.userAction.type === userAction.type &&
          state.lastAction.userAction.frame?.frameId === compareFrameId
        ) {
          state.lastAction.userAction.value = userAction.value;
        } else {
          state.record!.actions.push(action);
          state.lastAction = action;
        }
        break;
      case 'resize':
        chrome.windows.getCurrent((windowInfos) => {
          const htmlCoordinates = {
            width: windowInfos.width,
            height: windowInfos.height,
            top: windowInfos.top,
            left: windowInfos.left
          };
          if (
            state.lastAction &&
            state.lastAction.userAction &&
            state.lastAction.userAction.type === userAction.type &&
            state.lastAction.userAction.frame?.frameId === compareFrameId
          ) {
            state.lastAction.userAction.htmlCoordinates = htmlCoordinates;
          } else {
            action.userAction.htmlCoordinates = htmlCoordinates;
            state.record!.actions.push(action);
            state.lastAction = action;
          }
          saveUiRecordToLocalStorage(state.record!);
        });
        return; // resize gère son propre save
      default:
        state.record!.actions.push(action);
        state.lastAction = action;
        break;
    }
    state.last = now;
    state.record!.last = state.last;
    saveUiRecordToLocalStorage(state.record!);
  };

  if (userAction.frame && userAction.frame.frameIndex !== undefined) {
    // on est dans le cas d'une iframe hors devtools
    processAction(userAction.frame.frameId);
  } else {
    getSrcFromFrameId(tabId, frameId)
      .then(iframe => {
        userAction.frame = iframe;
      })
      .then(() => {
        processAction(frameId);
      })
      .catch(() => {
        // Frame non trouvée, on continue avec frameId 0
        userAction.frame = { src: '', frameId: 0 };
        processAction(0);
      });
  }
}

export function addScreenShot(tabId: number, isPopupVisible: boolean): Promise<boolean> {
  const state = getState(tabId);

  return new Promise(resolve => {
    if (!state.record) {
      state.record = new Record();
      state.lastAction = null;
    }
    if (isPopupVisible) {
      chrome.tabs.sendMessage(tabId, {
        action: 'HIDE'
      }, {
        frameId: 0
      }, () => { });
    }
    chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "png" }, imgData => {
      if (chrome.runtime.lastError || !imgData) {
        console.warn('Erreur capture screenshot:', chrome.runtime.lastError?.message);
        resolve(false);
        return;
      }

      const now = Date.now();
      const delay = isNaN(now - state.last) ? 0 : now - state.last;

      const action = new Action(delay, ActionType.SCREENSHOT, null, imgData);

      state.record!.actions.push(action);
      state.lastAction = action;
      state.last = now;
      if (isPopupVisible) {
        chrome.tabs.sendMessage(tabId, {
          action: 'SHOW'
        }, {
          frameId: 0
        }, () => { });
      }
      saveUiRecordToLocalStorage(state.record!);
      resolve(true);
    });
  });
}

export function addComment(comment: string, tabId?: number): void {
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record();
    state.record.actions = [];
  }

  const now = Date.now();
  const delay = isNaN(now - state.last) ? 0 : now - state.last;

  const action = new Action(delay, ActionType.COMMENT, null, comment);

  state.record.actions.push(action);
  state.lastAction = action;
  state.last = now;
  saveUiRecordToLocalStorage(state.record);
}

export function addRecordWindowSize(windowSize: WindowSize, tabId?: number): void {
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record(windowSize);
    state.lastAction = null;
  } else {
    state.record.windowSize = windowSize;
  }
}

export function addHttpUserAction(data: HttpReturn, tabId?: number): void {
  const state = getState(tabId);

  if (!state.record) {
    state.record = new Record();
    state.lastAction = null;
  }
  if (!state.record.httpRecords) {
    state.record.httpRecords = [];
  }

  state.record.httpRecords.unshift(data);
  state.record.httpRecords = removeDuplicateEntries(state.record.httpRecords);

  saveUiRecordToLocalStorage(state.record);
}

export function loadRecordFromStorage(tabId?: number): void {
  const state = getState(tabId);

  loadCompressed<Record>('uiRecord').then(data => {
    if (data) {
      if (!state.record) {
        state.record = new Record(data.windowSize);
        state.record.actions = data.actions;
        state.record.httpRecords = data.httpRecords;
        state.lastAction = data.actions && data.actions.length ? data.actions[data.actions.length - 1] : null;
        state.last = data.last;
      }
    } else {
      state.last = Date.now();
    }
  }).catch(() => {
    state.last = Date.now();
  });
}

export function deleteRecord(tabId?: number): void {
  const state = getState(tabId);
  state.record = null;
  state.lastAction = null;
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

function saveUiRecordToLocalStorage(record: Record): void {
  saveCompressed('uiRecord', record).catch(err => {
    console.error('Erreur sauvegarde uiRecord:', err);
  });

  chrome.runtime.sendMessage({
    action: 'UI_RECORD_CHANGED',
    value: record
  }, () => {
    // Ignorer les erreurs si aucun listener n'est présent
    if (chrome.runtime.lastError) {
      // Silencieux - pas de listener Angular actif
    }
  });
}
