import { Scenario, SCENARIOS_KEY } from '../../src/app/core/scenarios/scenario.models';
import { Player } from './background/player';
import {
  addComment,
  addHttpUserAction,
  addNavigate,
  addRecordByImage,
  addRecordWindowSize,
  addScreenShot,
  addUserAction,
  cleanupTabState,
  deleteRecord,
  flushPendingSave,
  initRecord,
  loadRecordFromStorage,
  replaceRecord,
  setActiveTab,
  setPause
} from './background/uiRecorderHandler';
import { UserAction } from './models/UserAction';
import { loadCompressed, saveCompressed } from './utils/compression';
import { appendHttpRecords } from './background/httpRecordStore';
import { getBodyFromData, removeDuplicateEntries } from './utils/utils';
import Port = chrome.runtime.Port;

let port;
let player = null;

// Cache local pour tuelloTracksBody (évite les appels répétés à chrome.storage pour chaque requête HTTP)
let tracksBodyCache: Array<{ key: string; body: any }> = [];
const TRACKS_BODY_MAX_SIZE = 10;

function isRestrictedUrl(url: string): boolean {
  return url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('edge://') || url.startsWith('chrome-extension://');
}

function applyBadgeForTab(tabId: number, url: string): void {
  if (isRestrictedUrl(url)) {
    chrome.action.setBadgeText({ text: 'OFF', tabId });
    chrome.action.setBadgeBackgroundColor({ color: 'gray', tabId });
    chrome.action.disable(tabId);
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
    chrome.action.enable(tabId);
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  // L'état d'enregistrement est indexé par onglet : les messages sans sender.tab
  // (panneau ouvert hors page, popup) doivent retomber sur l'onglet réellement actif.
  setActiveTab(activeInfo.tabId);
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      return;
    }
    applyBadgeForTab(tab.id, tab.url ?? '');
  });
});

// Libère l'état d'enregistrement d'un onglet fermé (sinon la Map grossit indéfiniment).
// La sauvegarde est debouncée : on la force avant de perdre l'onglet.
chrome.tabs.onRemoved.addListener((tabId) => {
  flushPendingSave();
  cleanupTabState(tabId);
});

// Gérer les changements d'URL sur l'onglet actif (et les reloads, qui resettent l'état per-tab de chrome.action)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    applyBadgeForTab(tabId, tab.url ?? '');
  }
});

self.addEventListener('activate', (event) => {
  (self as any).process = {
    versions: {
      node: 'test'
    }
  };
});

// // Listener pour les mises à jour des onglets (changement d'URL, rafraîchissement, etc.)
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.url) {
//     console.log(`TUELLO= L'URL de l'onglet ${tabId} a changé en : ${changeInfo.url}`);
//     // Vous pouvez ajouter ici du code pour traiter le changement d'URL
//   }
// });

// // Listener pour les changements de navigation (par exemple, l'utilisateur clique sur un lien, soumet un formulaire, etc.)
// chrome.webNavigation.onCompleted.addListener((details) => {
//   console.log(`TUELLO=La navigation dans l'onglet ${details.tabId} est terminée, URL: ${details.url}`);
//   // Vous pouvez ajouter ici du code pour traiter la fin de la navigation
// });

chrome.runtime.onInstalled.addListener(() => {
  init();
});

chrome.runtime.onStartup.addListener(async () => {
  const result = await chrome.storage.local.get<Record<string, any>>(['mosaicConfig']);
  const config = result['mosaicConfig'];
  if (config?.openOnStartup) {
    chrome.tabs.create({ url: chrome.runtime.getURL('mosaic/mosaic.html') });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sel') {
    chrome.tabs.sendMessage(
      tab.id,
      'JSON_VIEWER',
      {
        frameId: 0
      },
      () => {}
    );
  }
});

/** 
chrome.runtime.onInstalled.addListener(() => {
  // after extension is installed / upgraded
  chrome.storage.local.set({ color: '#3aa757' });
});
*/
/** 
chrome.action.onClicked.addListener(test);
function test(tab)  {

  chrome.storage.local.get(['disabled'], function(result) {
    if (!result.disabled) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: 'ACTIVATE'
          },
          () => chrome.tabs.sendMessage(tab.id, 'toggle', () => {
            chrome.action.setPopup({
              popup: "",
              tabId: tab.id
            });
            })
          );
    } else {
        chrome.action.setPopup({
          popup: "popup.html",
          tabId: tab.id
        });
        
    } 
  });
};
*/

/**
 * Attend qu'un onglet ait fini de charger (status "complete").
 */
function waitForTabComplete(tabId: number, timeoutMs = 12000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timeout'));
    }, timeoutMs);
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Diffuse un message à l'onglet émetteur puis à tous les autres onglets.
 * L'état du mock et de l'enregistrement est global (chrome.storage.local) : ne
 * prévenir que l'onglet courant laissait les autres onglets déjà ouverts dans
 * l'ancien mode jusqu'à leur rechargement.
 */
function broadcastToAllTabs(message: Record<string, unknown>, senderTabId?: number): void {
  if (senderTabId !== undefined && senderTabId >= 0) {
    chrome.tabs.sendMessage(senderTabId, message, () => chrome.runtime.lastError);
  }
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id === undefined || tab.id < 0 || tab.id === senderTabId) {
        continue;
      }
      // lastError est lu pour éviter les "Unchecked runtime.lastError" sur les
      // onglets sans content script (chrome://, Web Store, onglets déchargés).
      chrome.tabs.sendMessage(tab.id, message, () => chrome.runtime.lastError);
    }
  });
}

async function dynamicallyInjectContentScripts() {
  const contentScriptsToInject = [
    {
      id: 'hook',
      matches: ['<all_urls>'],
      js: ['httpmanager.js'],
      runAt: 'document_start',
      allFrames: true,
      // SECURITE: MAIN world requis pour intercepter window.fetch/XMLHttpRequest.
      // La migration vers ISOLATED world casserait l'interception HTTP (fonctionnalité centrale).
      // Atténuation : les données injectées sont validées avant envoi (validateTuelloRecords).
      world: 'MAIN'
    }
  ];

  try {
    // @ts-ignore
    await chrome.scripting.registerContentScripts(contentScriptsToInject);
  } catch (error) {
    console.error(error);
  }
}

/**
 * Crée les menus contextuels avec les traductions appropriées
 */
function createContextMenus(msgs?: Record<string, string>): void {
  const menuItems = [
    { id: 'sel', defaultTitle: 'JSON VIEWER', msgKey: 'mmn.spy-http.tabs.shortcuts.jsonviewer' },
    { id: 'id0', defaultTitle: 'Screenshot : ALT + MAJ + S', msgKey: 'mmn.spy-http.tabs.shortcuts.screenshot', suffix: ' : ALT + MAJ + S' },
    { id: 'id1', defaultTitle: 'Pause : ALT + MAJ + P', msgKey: 'mmn.spy-http.tabs.shortcuts.pause', suffix: ' : ALT + MAJ + P' },
    { id: 'id2', defaultTitle: 'Resume : ALT + MAJ + R', msgKey: 'mmn.spy-http.tabs.shortcuts.resume', suffix: ' : ALT + MAJ + R' },
    { id: 'id3', defaultTitle: 'Rec. by img :  ALT + MAJ + click / Coord. + ALT + MAJ + I', msgKey: 'mmn.spy-http.tabs.shortcuts.record.by.img', suffix: ' :  ALT + MAJ + click / Coord. + ALT + MAJ + I' },
    { id: 'id4', defaultTitle: 'Add comment :  ALT + MAJ + C', msgKey: 'mmn.spy-http.tabs.shortcuts.add.comment', suffix: ' :  ALT + MAJ + C' }
  ];

  for (const item of menuItems) {
    const title = msgs ? msgs[item.msgKey] + (item.suffix || '') : item.defaultTitle;
    chrome.contextMenus.create(
      {
        id: item.id,
        title,
        contexts: ['all']
      },
      () => chrome.runtime.lastError
    ); // ignore errors about an existing id
  }
}

async function init() {
  // Charger le cache tracksBody depuis chrome.storage au démarrage (avec décompression LZ)
  try {
    const tracks = await loadCompressed<Array<{ key: string; body: any }>>('tuelloTracksBody');
    if (Array.isArray(tracks)) {
      tracksBodyCache = tracks;
    }
  } catch {
    tracksBodyCache = [];
  }

  await dynamicallyInjectContentScripts();

  const results = await chrome.storage.local.get<Record<string, any>>(['messages']);
  await chrome.contextMenus.removeAll();

  const msgs = results.messages?.default;
  createContextMenus(msgs);

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.method === 'POST') {
        let requestBody;
        try {
          requestBody = getBodyFromData(details.requestBody?.raw[0]?.bytes);
        } catch (e) {
          // Le parsing du body a échoué - on continue avec requestBody = undefined
        }

        // Utiliser le cache local au lieu d'appeler chrome.storage pour chaque requête
        tracksBodyCache.unshift({
          key: details.url,
          body: requestBody
        });
        if (tracksBodyCache.length > TRACKS_BODY_MAX_SIZE) {
          tracksBodyCache.pop();
        }
        tracksBodyCache = removeDuplicateEntries(tracksBodyCache);

        // Synchroniser avec chrome.storage de manière asynchrone (avec compression LZ)
        saveCompressed('tuelloTracksBody', tracksBodyCache).catch(console.error);
      }
      // listener non bloquant (extraInfoSpec sans 'blocking') : il observe seulement
      return undefined;
    },
    { urls: ['<all_urls>'] },
    ['requestBody']
  );
}

// listerner pour le pause et le resume du recorder (les commandes sont déclarées dans le manifest)
chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'PAUSE':
      let pausedActionNumber;
      if (player !== null) {
        pausedActionNumber = player.launchAction('PAUSE');
      }
      // message au content script : currentWindow, sinon en multi-fenêtres tabs[0]
      // pouvait être l'onglet actif d'une autre fenêtre
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) {
          return;
        }
        chrome.tabs.sendMessage(
          tabId,
          'toggle',
          {
            frameId: 0
          },
          () => {
            // message au content script
            chrome.tabs.sendMessage(
              tabId,
              {
                action: 'ACTIONS_PAUSED',
                value: pausedActionNumber
              },
              () => chrome.runtime.lastError
            );
          }
        );
      });
      break;
    case 'RESUME':
      // message au content script
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) {
          return;
        }
        chrome.tabs.sendMessage(
          tabId,
          {
            action: 'HIDE'
          },
          {
            frameId: 0
          },
          () => {
            if (player !== null) {
              player.launchAction('PLAY');
            }
          }
        );
      });
      break;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, senderResponse) => {
  switch (msg.action) {
    case 'updateIcon':
      chrome.action.setIcon({ path: `/assets/logos/${msg.value}` });

      break;
    case 'DEACTIVATE':
      // on envoie un message au content scrip
      chrome.tabs.sendMessage(
        sender.tab.id,
        {
          action: 'DEACTIVATE'
        },
        () => {}
      );
      break;
    case 'FINISH_PLAY_ACTIONS':
      // listener de navigation : permet de désactiver et réactiver le player le temps que le dom se charge dans la nouvelle page
      chrome.webNavigation.onCompleted.removeListener(onCompletedPlayer);
      chrome.webNavigation.onBeforeNavigate.removeListener(onbeforePlayer);
      break;
    case 'LOAD_UI_RECORDERS':
      // on charge les enregistrements du local storage : uniquement pour la frame principale
      if (sender.frameId === 0) {
        loadRecordFromStorage(sender.tab?.id);
      }
      break;
    case 'START_UI_RECORDER':
      if (msg.value === true) {
        const recorderTabId = sender.tab?.id;
        if (recorderTabId !== undefined) {
          setActiveTab(recorderTabId);
        }

        // msg.reset === false : on reprend l'enregistrement existant (bouton « ajouter »
        // du panneau, ou panneau rouvert alors que l'enregistrement tourne déjà).
        // initRecord repartait sinon d'un record vide qui écrasait l'enregistrement
        // déjà stocké dès la première sauvegarde.
        const isAppend = msg.reset === false;
        const recorderReady = isAppend ? loadRecordFromStorage(recorderTabId) : Promise.resolve(initRecord(recorderTabId));

        recorderReady.then(() => {
          chrome.windows.getCurrent((windowInfos) => {
            let data = {
              width: windowInfos.width,
              height: windowInfos.height,
              top: windowInfos.top,
              left: windowInfos.left
            };
            addRecordWindowSize(data, recorderTabId);
          });

          // L'action de navigation initiale n'a de sens que pour un nouvel
          // enregistrement : le record repris porte déjà la sienne.
          if (!isAppend) {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
              const activeTab = tabs[0];
              if (!activeTab?.id) {
                return;
              }
              const action = new UserAction(null);
              action.type = 'navigation';
              action.hrefLocation = activeTab.url;
              addNavigate(action, activeTab.id, 0);
            });
          }
        });
      }
      // on envoie un message au content scrip
      if (sender && sender.tab && sender.tab.id >= 0) {
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'START_UI_RECORDER',
            value: msg.value
          },
          () => {}
        );
      } else {
        port.postMessage({
          action: 'START_UI_RECORDER',
          value: msg.value
        });
      }
      break;
    case 'VIEW_IMAGE':
      // on envoie un message au content scrip
      if (sender && sender.tab && sender.tab.id >= 0) {
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'VIEW_IMAGE',
            value: msg.value
          },
          {
            frameId: 0
          },
          () => {}
        );
      } else {
        port.postMessage({
          action: 'VIEW_IMAGE',
          value: msg.value
        });
      }
      break;

    case 'MOUSE_COORDINATES':
      // on envoie un message au content scrip
      if (sender && sender.tab && sender.tab.id >= 0) {
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'MOUSE_COORDINATES',
            value: msg.value
          },
          () => {}
        );
      } else {
        port.postMessage({
          action: 'MOUSE_COORDINATES',
          value: msg.value
        });
      }

      break;

    case 'HIDE':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'HIDE'
          },
          {
            frameId: 0
          },
          () => {}
        );
      }
      break;

    case 'HTTP_MOCK_STATE':
      // Etat global : tous les onglets doivent basculer, pas seulement l'émetteur
      broadcastToAllTabs({ action: 'HTTP_MOCK_STATE', value: msg.value }, sender?.tab?.id);
      break;
    case 'UPDATE_MENU':
      if (sender && sender.tab && sender.tab.id >= 0) {
        chrome.storage.local.get(['messages'], (results: Record<string, any>) => {
          if (results.messages) {
            const msgs = results.messages.default;
            chrome.contextMenus.update('id0', {
              title: msgs['mmn.spy-http.tabs.shortcuts.screenshot'] + ' : ALT + MAJ + S',
              contexts: ['all']
            });
            chrome.contextMenus.update('id1', {
              title: msgs['mmn.spy-http.tabs.shortcuts.pause'] + ' : ALT + MAJ + P',
              contexts: ['all']
            });
            chrome.contextMenus.update('id2', {
              title: msgs['mmn.spy-http.tabs.shortcuts.resume'] + ' : ALT + MAJ + R',
              contexts: ['all']
            });
            chrome.contextMenus.update('id3', {
              title: msgs['mmn.spy-http.tabs.shortcuts.record.by.img'] + ' :  ALT + MAJ + click / Coord. + ALT + MAJ + I',
              contexts: ['all']
            });
            chrome.contextMenus.update('id4', {
              title: msgs['mmn.spy-http.tabs.shortcuts.add.comment'] + ' :  ALT + MAJ + C',
              contexts: ['all']
            });
          }
        });
      }
      break;
    case 'HTTP_RECORD_STATE':
      // Etat global : tous les onglets doivent basculer, pas seulement l'émetteur
      broadcastToAllTabs({ action: 'HTTP_RECORD_STATE', value: msg.value }, sender?.tab?.id);
      break;
    case 'MMA_RECORDS_CHANGE':
      // Les mocks sont partagés par tous les onglets : idem
      broadcastToAllTabs({ action: 'MMA_RECORDS_CHANGE' }, sender?.tab?.id);
      break;
    case 'MMA_TAGS_CHANGE':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'MMA_TAGS_CHANGE'
          },
          () => {}
        );
      }
      break;
    case 'TRACK_PLAY_STATE':
      if (sender && sender.tab && sender.tab.id >= 0) {
        /** 
        if (msg.value) {
          chrome.webRequest.onBeforeRequest.addListener(
            (details) => {
              if (details.method === 'POST') {
                let requestBody;
                try {
                  requestBody = getBodyFromData(details.requestBody?.raw[0]?.bytes);
                } catch (e) {

                }
                chrome.storage.local.get(['tuelloTracksBody'], items => {
                  if (!chrome.runtime.lastError) {
                    if (!items.tuelloTracksBody || !Array.isArray(items.tuelloTracksBody)) {
                      items.tuelloTracksBody = [];
                    }

                    items.tuelloTracksBody.unshift({
                      key: details.url,
                      body: requestBody
                    });
                    if (items.tuelloTracksBody.length > 10) {
                      items.tuelloTracksBody.pop();
                    }
                  }

                  chrome.storage.local.set({ tuelloTracksBody: removeDuplicateEntries(items.tuelloTracksBody) });
                });
              }
            },
            {urls: ["<all_urls>"]},
            ["requestBody"]
          );
        } else {
          chrome.storage.local.remove(['tuelloTracksBody']);
        }
        */

        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'TRACK_PLAY_STATE',
            value: msg.value
          },
          () => {}
        );
      }
      break;
    case 'SEARCH_ELEMENTS_ACTIVATED':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'SEARCH_ELEMENTS_ACTIVATED',
            value: msg.value
          },
          () => {}
        );
      }
      break;
    case 'VIEW_CLICK_ACTION':
      if (sender && sender.tab && sender.tab.id >= 0) {
        const action: UserAction = msg.value;
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'VIEW_CLICK_ACTION',
            value: action
          },
          {
            frameId: action.frame && action.frame.frameId ? action.frame.frameId : 0
          },
          () => {}
        );
      }
      break;
    case 'SHOW':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'SHOW'
          },
          {
            frameId: 0
          },
          () => {}
        );
      }
      break;
    case 'PLAY_ACTION_ERROR':
      chrome.action.setIcon({ path: '/assets/logos/tuello-32x32.png' });
      let pausedActionNumber;
      if (player !== null) {
        pausedActionNumber = player.launchAction('PAUSE');
      }
      // message au content script de l'onglet qui rejoue (sender), et pas à l'onglet
      // actif d'une fenêtre quelconque
      chrome.tabs.sendMessage(
        sender.tab.id,
        'toggle',
        {
          frameId: 0
        },
        () => {
          chrome.tabs.sendMessage(
            sender.tab.id,
            {
              action: 'ACTIONS_PAUSED',
              value: pausedActionNumber
            },
            () => chrome.runtime.lastError
          );
        }
      );

      // on doit faire un scroll vers  le haut sur toutes les frames
      chrome.webNavigation.getAllFrames(
        {
          tabId: sender.tab.id
        },
        (frames) => {
          for (const iframe of frames) {
            const options = iframe
              ? {
                  frameId: iframe.frameId
                }
              : {};
            // on envoie un message au bon content scrip
            chrome.tabs.sendMessage(
              sender.tab.id,
              {
                action: 'PLAY_USER_ACTION',
                value: {
                  scrollX: 0,
                  scrollY: 0,
                  type: 'scroll'
                }
              },
              options,
              () => {}
            );
          }
        }
      );

      break;
    case 'toggle':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          'toggle',
          {
            frameId: 0
          },
          () => {}
        );
      }
      break;

    // @TODO A inclure dans le play des actions
    case 'PLAY_USER_ACTION_INIT':
      // listener de navigation : permet de désactiver et réactiver le player le temps que le dom se charge dans la nouvelle page
      chrome.webNavigation.onCompleted.addListener(onCompletedPlayer);
      chrome.webNavigation.onBeforeNavigate.addListener(onbeforePlayer);
      // on doit faire un scroll vers  le haut sur toutes les frames
      chrome.webNavigation.getAllFrames(
        {
          tabId: sender.tab.id
        },
        (frames) => {
          for (const iframe of frames) {
            const options = iframe
              ? {
                  frameId: iframe.frameId
                }
              : {};
            // on envoie un message au bon content scrip
            chrome.tabs.sendMessage(
              sender.tab.id,
              {
                action: 'MOCK_HTTP_USER_ACTION',
                value: false
              },
              options,
              () => {}
            );
            chrome.tabs.sendMessage(
              sender.tab.id,
              {
                action: 'PLAY_USER_ACTION',
                value: {
                  scrollX: 0,
                  scrollY: 0,
                  type: 'scroll'
                }
              },
              options,
              () => {}
            );
          }
        }
      );

      break;
    case 'PLAY_USER_ACTIONS':
      if (player) {
        // destroy() et pas seulement RESET : une action en cours (jusqu'à 30s de
        // timeout) relancerait sinon l'ancien player en parallèle du nouveau.
        player.destroy();
      }
      player = new Player(msg.value, sender.tab.id, senderResponse);
      player.launchAction('PLAY');
      break;
    case 'MOCK_HTTP_USER_ACTION':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'MOCK_HTTP_USER_ACTION',
            value: msg.value,
            data: msg.data
          },
          () => {}
        );
      } else {
        port.postMessage(
          {
            action: 'MOCK_HTTP_USER_ACTION',
            value: msg.value,
            data: msg.data
          },
          () => {}
        );
      }
      break;
    case 'ACTIVATE':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        if (tabId === undefined) {
          senderResponse();
          return;
        }
        chrome.tabs.sendMessage(
          tabId,
          {
            action: 'ACTIVATE'
          },
          {
            frameId: 0
          },
          () =>
            chrome.tabs.sendMessage(
              tabId,
              'open',
              {
                frameId: 0
              },
              () => {
                senderResponse();
                return true;
              }
            )
        );
      });
      return true;
    case 'RECORD_USER_ACTION':
      addUserAction(msg.value, sender.tab.id, sender.frameId);
      break;
    case 'RECORD_BY_IMAGE_ACTION':
      addRecordByImage(msg.value, sender.tab.id, sender.frameId);
      senderResponse();
      break;
    case 'SCREENSHOT_ACTION':
      addScreenShot(sender.tab.id, msg.value).then((ret) => senderResponse());
      break;
    case 'COMMENT_ACTION':
      addComment(msg.value, sender.tab?.id);
      senderResponse();
      break;
    case 'PAUSE_OTHER_ACTIONS_FOR_COMMENT_ACTION':
      setPause(msg.value, sender.tab?.id);
      break;
    case 'RECORD_WINDOW_SIZE':
      // L'initialisation est maintenant gérée par START_UI_RECORDER
      // Ce cas est conservé pour la compatibilité avec les anciens appels
      break;
    case 'RECORD_HTTP':
      addHttpUserAction(msg.value, sender.tab?.id);
      break;
    case 'UI_RECORD_UPDATED':
      // Le panneau a édité le record : synchroniser la copie mémoire du background
      replaceRecord(msg.value, sender.tab?.id);
      break;
    case 'RECORD_HTTP_BATCH':
      // Persistance centralisée ici : plusieurs onglets peuvent enregistrer en même
      // temps, un verrou par page ne les protégeait pas les uns des autres.
      appendHttpRecords(msg.value)
        .then((added) => {
          if (added) {
            // Prévenir le panneau Angular (s'il est ouvert) de rafraîchir sa vue
            chrome.runtime.sendMessage({ refresh: true }, () => chrome.runtime.lastError);
          }
          senderResponse({ added });
        })
        .catch((error) => {
          console.error("Tuello: Erreur lors de l'enregistrement HTTP:", error);
          senderResponse({ added: false });
        });
      return true;
    case 'RECORD_USER_ACTION_DELETE':
      deleteRecord(sender.tab?.id).then(() => senderResponse());
      return true;
    case 'MOSAIC_OPEN_AND_CAPTURE':
      (async () => {
        const { url, urlId, mosaicTabId } = msg;
        let createdTabId: number | null = null;
        try {
          const createdTab = await chrome.tabs.create({ url, active: true });
          createdTabId = createdTab.id;
          await waitForTabComplete(createdTabId);
          const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 70 });
          await chrome.storage.local.set({ [`mosaic_screenshot_${urlId}`]: dataUrl });
          await chrome.tabs.remove(createdTabId);
          await chrome.tabs.update(mosaicTabId, { active: true });
          chrome.tabs.sendMessage(mosaicTabId, { action: 'MOSAIC_SCREENSHOT_CAPTURED', urlId, success: true }, () => {});
          senderResponse({ success: true });
        } catch (e) {
          if (createdTabId) chrome.tabs.remove(createdTabId).catch(() => {});
          chrome.tabs.sendMessage(mosaicTabId, { action: 'MOSAIC_SCREENSHOT_CAPTURED', urlId, success: false }, () => {});
          senderResponse({ success: false });
        }
      })();
      return true;
    case 'MOSAIC_PLAY_SCENARIO':
      (async () => {
        try {
          const scenario = await findScenario(msg.scenarioId);
          const createdTab = await chrome.tabs.create({ url: msg.url, active: true });
          if (!scenario?.actions?.length) {
            // Scénario introuvable ou vide : le site est quand même ouvert
            senderResponse({ success: false });
            return;
          }
          await waitForTabComplete(createdTab.id);
          await playScenarioOnTab(scenario, createdTab.id);
          senderResponse({ success: true });
        } catch (e) {
          console.warn('Tuello: échec du lancement du scénario', e);
          stopScenarioPlayer();
          senderResponse({ success: false });
        }
      })();
      return true;
  }
  return true;
});

/**
 * Recherche un scénario enregistré (clé compressée tuelloScenarios).
 */
async function findScenario(scenarioId: string): Promise<Scenario | null> {
  const scenarios = (await loadCompressed<Scenario[]>(SCENARIOS_KEY)) ?? [];
  return scenarios.find((scenario) => scenario.id === scenarioId) ?? null;
}

/**
 * Rejoue un scénario dans l'onglet fraîchement ouvert par la mosaïque.
 * Rejeu silencieux : ni panneau Tuello, ni écran de résultats à la fin.
 */
async function playScenarioOnTab(scenario: Scenario, tabId: number): Promise<void> {
  // Les mocks HTTP d'un enregistrement précédent ne doivent pas polluer le scénario
  chrome.tabs.sendMessage(tabId, { action: 'MOCK_HTTP_USER_ACTION', value: false }, () => chrome.runtime.lastError);

  // Les coordonnées enregistrées supposent la taille de fenêtre d'origine
  const windowSize = scenario.windowSize;
  if (windowSize?.width && windowSize?.height) {
    // On cible la fenêtre de l'onglet rejoué : getCurrent() depuis le service
    // worker ne désigne pas forcément celle de la mosaïque.
    const playedTab = await chrome.tabs.get(tabId);
    const updateInfo: chrome.windows.UpdateInfo = {
      state: 'normal',
      width: windowSize.width,
      height: windowSize.height
    };
    if (windowSize.top !== undefined) {
      updateInfo.top = windowSize.top;
    }
    if (windowSize.left !== undefined) {
      updateInfo.left = windowSize.left;
    }
    await chrome.windows.update(playedTab.windowId, updateInfo);
  }

  if (player) {
    player.destroy();
  }
  // Pause/reprise du player pendant les navigations déclenchées par le scénario
  chrome.webNavigation.onCompleted.addListener(onCompletedPlayer);
  chrome.webNavigation.onBeforeNavigate.addListener(onbeforePlayer);

  player = new Player(scenario.actions, tabId, () => {}, { onFinished: stopScenarioPlayer });
  player.launchAction('PLAY');
}

/** Nettoyage de fin (ou d'échec) d'un scénario joué depuis la mosaïque */
function stopScenarioPlayer(): void {
  // L'icône n'est pas touchée : un enregistrement en cours dans un autre onglet
  // doit garder la sienne.
  chrome.webNavigation.onCompleted.removeListener(onCompletedPlayer);
  chrome.webNavigation.onBeforeNavigate.removeListener(onbeforePlayer);
}

/**
 * fonction exécutée avant une navigation ou une navigation d'une iframe
 * permet de désactiver le player
 */
function onbeforePlayer(details) {
  // Seules les navigations de l'onglet rejoué concernent le player : une navigation
  // dans un autre onglet mettait le rejeu en pause sans le relancer.
  if (details.frameId === 0 && player !== null && details.tabId === player.chromeTabId) {
    player.launchAction('PAUSE');
  }
}

/**
 * fonction exécutée apres une navigation ou une navigation d'une iframe
 * permet de réactiver le player
 */
function onCompletedPlayer(details) {
  if (details.frameId === 0 && player !== null && details.tabId === player.chromeTabId) {
    player.launchAction('PLAY');
  }
}
