import { Scenario, SCENARIOS_KEY, stripLeadingNavigations } from '../../src/app/core/scenarios/scenario.models';
import { Action } from '../../src/app/spy-http/models/Action';
import { Player } from './background/player';
import {
  addComment,
  addHttpUserAction,
  addConsoleLogs,
  attachHttpSettledScreenshot,
  addNavigate,
  addRecordByImage,
  addRecordByLabel,
  addRecordWindowSize,
  addScreenShot,
  addUserAction,
  cleanupTabState,
  deleteRecord,
  flushPendingSave,
  initRecord,
  loadRecordFromStorage,
  prepareClickScreenshot,
  replaceRecord,
  setActiveTab,
  setPause
} from './background/uiRecorderHandler';
import { UserAction } from './models/UserAction';
import { loadCompressed } from './utils/compression';
import { appendHttpRecords, clearHttpRecords } from './background/httpRecordStore';
import { appendTrack, clearTracks, initTrackStore } from './background/trackStore';
import { formatShortcut, resolvePlatform } from './utils/platform';
import Port = chrome.runtime.Port;

let port;
let player = null;

// Enregistré au niveau racine pour survivre aux mises en veille du service worker
initTrackStore();

function isRestrictedUrl(url: string): boolean {
  return url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('edge://') || url.startsWith('chrome-extension://');
}

/** Paramètre d'URL qui distingue l'app ouverte dans le panneau latéral de Chrome. */
const SIDE_PANEL_PARAM = 'sidepanel';

function applyBadgeForTab(tabId: number, url: string): void {
  chrome.action.setBadgeText({ text: '', tabId });
  chrome.action.enable(tabId);
  // Page sans site (nouvel onglet, chrome://, page d'extension) : le content script ne
  // peut pas y injecter le panneau. Sans popup, le clic sur l'action déclenche
  // action.onClicked, qui ouvre Tuello dans le panneau latéral de Chrome à la place.
  chrome.action.setPopup({ tabId, popup: isRestrictedUrl(url) ? '' : 'popup.html' });
}

/**
 * Panneau latéral propre à l'onglet : il reste ouvert quand l'utilisateur quitte le
 * nouvel onglet pour un site, et l'app sait quel onglet piloter via l'URL.
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) {
    return;
  }
  // Pas d'await avant open() : l'ouverture doit rester dans le geste utilisateur
  chrome.sidePanel.setOptions({ tabId: tab.id, path: `sidepanel.html?${SIDE_PANEL_PARAM}=${tab.id}`, enabled: true });
  chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
});

/**
 * Onglet piloté par l'app quand elle tourne dans le panneau latéral, null sinon.
 * Dans l'iframe injectée, sender.tab désigne déjà la page.
 */
function getSidePanelTabId(sender: chrome.runtime.MessageSender): number | null {
  if (sender.tab || !sender.url?.startsWith(chrome.runtime.getURL('index.html'))) {
    return null;
  }
  const tabId = Number(new URL(sender.url).searchParams.get(SIDE_PANEL_PARAM));
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
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

// Onglets déjà ouverts à l'installation ou au rechargement de l'extension : sans ça,
// un nouvel onglet existant garderait le popup et n'ouvrirait pas le panneau latéral.
chrome.tabs.query({}, (tabs) => {
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.id >= 0) {
      applyBadgeForTab(tab.id, tab.url ?? '');
    }
  }
});

/**
 * Types de navigation déclenchés hors de la page : le content script ne voit aucun
 * clic pour ceux-là (barre d'adresse, favori, page d'accueil, suggestion, F5). Les
 * transitions issues d'un clic dans la page ('link', 'form_submit') sont exclues :
 * l'action de clic est déjà enregistrée et rejoue la navigation.
 */
const RECORDED_TRANSITION_TYPES = ['typed', 'auto_bookmark', 'generated', 'keyword', 'keyword_generated', 'start_page', 'reload'];

/**
 * Enregistre les navigations que le content script ne peut pas capter : favori,
 * URL saisie, boutons précédent/suivant, rechargement (F5). Sans ça, un changement
 * de site en cours d'enregistrement n'apparaissait pas dans le scénario et le rejeu
 * restait sur la page précédente.
 */
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || details.tabId === undefined || details.tabId < 0 || isRestrictedUrl(details.url ?? '')) {
    return;
  }
  // Le rejeu navigue lui aussi : ses navigations ne sont pas des actions utilisateur
  if (player !== null && player.chromeTabId === details.tabId) {
    return;
  }
  // Une redirection décidée par la page se reproduira d'elle-même au rejeu ; la
  // redirection serveur, elle, fait partie de la navigation demandée (c'est l'URL
  // d'arrivée qui est enregistrée, la seule qui sera atteinte au rejeu).
  if (details.transitionQualifiers?.includes('client_redirect')) {
    return;
  }
  const fromHistory = details.transitionQualifiers?.includes('forward_back');
  if (!fromHistory && !RECORDED_TRANSITION_TYPES.includes(details.transitionType)) {
    return;
  }

  chrome.storage.local.get(['uiRecordActivated', 'uiRecordTabId'], (results: Record<string, any>) => {
    // Seul l'onglet suivi par l'enregistrement compte : un onglet ouvert à côté
    // pendant l'enregistrement ne doit pas glisser ses navigations dans le scénario.
    if (!results['uiRecordActivated'] || results['uiRecordTabId'] !== details.tabId) {
      return;
    }
    // L'onglet peut n'avoir aucun état en mémoire (service worker redémarré) : on
    // repart du record stocké plutôt que d'en créer un vide qui écraserait
    // l'enregistrement en cours.
    loadRecordFromStorage(details.tabId).then(() => {
      const action = new UserAction(null);
      // Un rechargement est rejoué comme tel : demander la même URL ne recharge pas
      // toujours la page, et l'utilisateur qui fait F5 attend bien un rechargement.
      action.type = details.transitionType === 'reload' ? 'reload' : 'navigation';
      action.hrefLocation = details.url;
      addNavigate(action, details.tabId, 0, true);
    });
  });
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
  // Aucun rejeu ne survit à la fermeture du navigateur : le drapeau resté à true
  // laisserait le panneau bloqué sur le bouton stop.
  chrome.storage.local.set({ uiPlayActivated: false });

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
    let settled = false;
    const done = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      error ? reject(error) : resolve();
    };
    const timeout = setTimeout(() => done(new Error('Timeout')), timeoutMs);
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // L'onglet peut avoir fini de charger avant la pose du listener : sans cette
    // vérification, l'attente allait jusqu'au timeout et le scénario ne partait pas.
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab?.status === 'complete') {
        done();
      }
    });
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

/**
 * Onglet sur lequel porte l'enregistrement : celui d'où vient le message quand il
 * est connu (le panneau est injecté dans la page), l'onglet actif sinon. L'onglet
 * émetteur est plus fiable que la requête sur l'onglet actif, qui peut désigner une
 * autre fenêtre.
 */
function resolveRecorderTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    if (tabId !== undefined && tabId >= 0) {
      chrome.tabs.get(tabId, (tab) => {
        resolve(chrome.runtime.lastError || !tab ? null : tab);
      });
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] ?? null);
    });
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
 * Construit les libellés des menus contextuels : les touches affichées dépendent
 * de l'OS (⌥ / ⇧ sur macOS, Alt / Maj ailleurs) et des raccourcis personnalisés
 * enregistrés par l'utilisateur.
 */
async function buildMenuItems(msgs?: Record<string, string>): Promise<Array<{ id: string; title: string }>> {
  const platform = await resolvePlatform();
  const translated = {
    alt: msgs?.['mmn.spy-http.tabs.shortcuts.key.alt'],
    shift: msgs?.['mmn.spy-http.tabs.shortcuts.key.shift']
  };
  const click = msgs?.['mmn.spy-http.tabs.shortcuts.key.click'] || 'click';
  const coord = msgs?.['mmn.spy-http.tabs.shortcuts.key.coord'] || 'Coord.';

  const stored = (await chrome.storage.local.get<Record<string, any>>(['tuelloKeyboardShortcut'])).tuelloKeyboardShortcut;
  const screenshotKey = (stored?.screenshot?.key || 'S').toUpperCase();
  const captureImageKey = (stored?.captureImage?.key || 'I').toUpperCase();
  const commentKey = (stored?.comment?.key || 'C').toUpperCase();

  const combo = (...keys: string[]) => formatShortcut(keys, translated, platform);

  return [
    { id: 'sel', title: msgs?.['mmn.spy-http.tabs.shortcuts.jsonviewer'] || 'JSON VIEWER' },
    { id: 'id0', title: `${msgs?.['mmn.spy-http.tabs.shortcuts.screenshot'] || 'Screenshot'} : ${combo('alt', 'shift', screenshotKey)}` },
    { id: 'id1', title: `${msgs?.['mmn.spy-http.tabs.shortcuts.pause'] || 'Pause'} : ${combo('alt', 'shift', 'P')}` },
    { id: 'id2', title: `${msgs?.['mmn.spy-http.tabs.shortcuts.resume'] || 'Resume'} : ${combo('alt', 'shift', 'R')}` },
    {
      id: 'id3',
      title: `${msgs?.['mmn.spy-http.tabs.shortcuts.record.by.img'] || 'Rec. by img'} : ${combo('alt', 'shift', click)} / ${combo(coord, 'alt', 'shift', captureImageKey)}`
    },
    {
      id: 'id5',
      title: `${msgs?.['mmn.spy-http.tabs.shortcuts.record.by.label'] || 'Record by label'} : ${combo('shift', click)}`
    },
    { id: 'id4', title: `${msgs?.['mmn.spy-http.tabs.shortcuts.add.comment'] || 'Add comment'} : ${combo('alt', 'shift', commentKey)}` }
  ];
}

/**
 * Crée les menus contextuels avec les traductions appropriées
 */
async function createContextMenus(msgs?: Record<string, string>): Promise<void> {
  const menuItems = await buildMenuItems(msgs);

  for (const item of menuItems) {
    chrome.contextMenus.create(
      {
        id: item.id,
        title: item.title,
        contexts: ['all']
      },
      () => chrome.runtime.lastError
    ); // ignore errors about an existing id
  }
}

/**
 * Met à jour les titres des menus contextuels existants
 */
async function updateContextMenus(msgs?: Record<string, string>): Promise<void> {
  const menuItems = await buildMenuItems(msgs);

  for (const item of menuItems) {
    chrome.contextMenus.update(item.id, { title: item.title, contexts: ['all'] }, () => chrome.runtime.lastError);
  }
}

async function init() {
  await dynamicallyInjectContentScripts();

  const results = await chrome.storage.local.get<Record<string, any>>(['messages']);
  await chrome.contextMenus.removeAll();

  const msgs = results.messages?.default;
  await createContextMenus(msgs);
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
  const sidePanelTabId = getSidePanelTabId(sender);
  if (sidePanelTabId === null) {
    return handleMessage(msg, sender, senderResponse);
  }
  // Message du panneau latéral : il n'a pas de sender.tab. On le traite comme s'il
  // venait de l'iframe injectée dans l'onglet piloté, pour que les relais vers le
  // content script et l'état d'enregistrement par onglet visent la bonne page.
  chrome.tabs.get(sidePanelTabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      senderResponse();
      return;
    }
    handleMessage(msg, { ...sender, tab }, senderResponse);
  });
  return true;
});

function handleMessage(msg, sender: chrome.runtime.MessageSender, senderResponse: (response?: any) => void): boolean | void {
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
      // Le rejeu est terminé : le panneau doit repasser du bouton stop au bouton play
      player = null;
      chrome.storage.local.set({ uiPlayActivated: false });
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
        // Onglet suivi par l'enregistrement : seules ses navigations hors page
        // (favori, URL saisie) sont enregistrées, pas celles d'un onglet ouvert à
        // côté pendant l'enregistrement.
        resolveRecorderTab(recorderTabId).then((tab) => {
          if (tab?.id !== undefined) {
            chrome.storage.local.set({ uiRecordTabId: tab.id });
          }
        });

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
            // La taille de fenêtre peut repartir d'un record vide : la navigation
            // initiale doit être ajoutée après, sinon elle disparaissait une fois
            // sur deux, selon lequel des deux traitements asynchrones finissait en
            // dernier.
            addRecordWindowSize(data, recorderTabId).then(() => {
              // L'action de navigation initiale n'a de sens que pour un nouvel
              // enregistrement : le record repris porte déjà la sienne.
              if (isAppend) {
                return;
              }
              resolveRecorderTab(recorderTabId).then((tab) => {
                if (!tab?.id || isRestrictedUrl(tab.url ?? '')) {
                  return;
                }
                const action = new UserAction(null);
                action.type = 'navigation';
                action.hrefLocation = tab.url;
                // Même onglet que la taille de fenêtre : l'état d'enregistrement est
                // indexé par onglet, l'action irait sinon dans un autre record.
                addNavigate(action, recorderTabId ?? tab.id, 0);
              });
            });
          });
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
      // Message émis par la page d'extension (pas par un onglet) : pas de garde sur sender.tab,
      // les menus contextuels sont globaux.
      chrome.storage.local.get(['messages'], (results: Record<string, any>) => {
        updateContextMenus(results.messages?.default).catch(console.error);
      });
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
      // Scénario lancé depuis la mosaïque : on abandonne le rejeu sans rien afficher,
      // il n'y a personne pour le reprendre et l'utilisateur n'a demandé qu'un site.
      if (player !== null && player.silent) {
        console.warn('Tuello: action introuvable, rejeu du scénario interrompu');
        player.finishSilently();
        player = null;
        break;
      }
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
      // Le panneau lit ce drapeau pour proposer l'arrêt du rejeu (il est réouvert à
      // chaque navigation du scénario et perd son état interne)
      chrome.storage.local.set({ uiPlayActivated: true });
      player.launchAction('PLAY');
      break;
    case 'STOP_PLAY_USER_ACTIONS':
      stopPlayer(sender?.tab?.id);
      senderResponse();
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
    case 'PREPARE_CLICK_SCREENSHOT':
      prepareClickScreenshot(msg.value, sender.tab?.id);
      break;
    case 'RECORD_BY_IMAGE_ACTION':
      addRecordByImage(msg.value, sender.tab.id, sender.frameId);
      senderResponse();
      break;
    case 'RECORD_BY_LABEL_ACTION':
      addRecordByLabel(msg.value, sender.tab.id, sender.frameId);
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
    case 'RECORD_CONSOLE_LOG':
      addConsoleLogs(msg.value, sender.tab?.id);
      break;
    case 'HTTP_SETTLED_SCREENSHOT':
      attachHttpSettledScreenshot(msg.value, sender.tab?.id);
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
    case 'APPEND_TRACK':
      // Persistance centralisée : plusieurs frames et onglets traquent en même temps
      appendTrack(msg.value)
        .then((added) => {
          if (added) {
            // Prévenir le panneau Angular (s'il est ouvert) de rafraîchir sa vue
            chrome.runtime.sendMessage({ refreshTrackData: true }, () => chrome.runtime.lastError);
          }
          senderResponse({ added });
        })
        .catch((error) => {
          console.error("Tuello: Erreur lors de l'ajout du track:", error);
          senderResponse({ added: false });
        });
      return true;
    case 'CLEAR_TRACKS':
      clearTracks()
        .then(() => senderResponse({ success: true }))
        .catch((error) => {
          console.error("Tuello: Erreur lors de l'effacement des tracks:", error);
          senderResponse({ success: false });
        });
      return true;
    case 'CLEAR_HTTP_RECORDS':
      // Passe par le même writeChain que RECORD_HTTP_BATCH : sans ça, un
      // enregistrement HTTP en cours peut relire les mocks juste avant l'effacement
      // puis les réécrire juste après, ressuscitant la liste supprimée.
      clearHttpRecords()
        .then(() => senderResponse({ success: true }))
        .catch((error) => {
          console.error("Tuello: Erreur lors de l'effacement des enregistrements HTTP:", error);
          senderResponse({ success: false });
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
      // L'onglet est ouvert par la mosaïque elle-même : le background ne fait
      // que rejouer le scénario dedans, sinon un secours côté mosaïque ouvrait
      // un second onglet dès que la réponse tardait ou était volée.
      (async () => {
        try {
          const scenario = await findScenario(msg.scenarioId);
          // Les scénarios enregistrés avant l'exclusion de la navigation initiale
          // en portent encore une : elle renverrait l'onglet vers l'URL d'origine.
          const actions = stripLeadingNavigations(scenario?.actions);
          if (!actions.length) {
            return;
          }
          await waitForTabComplete(msg.tabId);
          await playScenarioOnTab(scenario, actions, msg.tabId);
        } catch (e) {
          console.warn('Tuello: échec du rejeu du scénario', e);
          stopScenarioPlayer();
        }
      })();
      return true;
  }
  return true;
}

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
async function playScenarioOnTab(scenario: Scenario, actions: Action[], tabId: number): Promise<void> {
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

  player = new Player(actions, tabId, () => {}, { onFinished: stopScenarioPlayer });
  player.launchAction('PLAY');
}

/**
 * Interrompt le rejeu en cours (bouton stop du panneau) : le player, les listeners
 * de navigation, les mocks HTTP activés pour l'occasion et le bandeau de commentaire.
 * Le panneau est réaffiché pour que l'utilisateur retrouve la liste des actions.
 */
function stopPlayer(senderTabId?: number): void {
  const playedTabId = player?.chromeTabId ?? senderTabId;

  if (player !== null) {
    player.destroy();
    player = null;
  }
  chrome.webNavigation.onCompleted.removeListener(onCompletedPlayer);
  chrome.webNavigation.onBeforeNavigate.removeListener(onbeforePlayer);
  chrome.storage.local.set({ uiPlayActivated: false });
  chrome.action.setIcon({ path: '/assets/logos/tuello-32x32.png' });

  if (playedTabId === undefined || playedTabId < 0) {
    return;
  }
  // Les mocks ne concernent que le rejeu : ils doivent être coupés dans toutes les frames
  chrome.tabs.sendMessage(playedTabId, { action: 'MOCK_HTTP_USER_ACTION', value: false }, () => chrome.runtime.lastError);
  chrome.tabs.sendMessage(playedTabId, { action: 'HIDE_REPLAY_COMMENT' }, { frameId: 0 }, () => chrome.runtime.lastError);
  chrome.tabs.sendMessage(playedTabId, { action: 'SHOW' }, { frameId: 0 }, () => chrome.runtime.lastError);
}

/** Nettoyage de fin (ou d'échec) d'un scénario joué depuis la mosaïque */
function stopScenarioPlayer(): void {
  // L'icône n'est pas touchée : un enregistrement en cours dans un autre onglet
  // doit garder la sienne.
  chrome.webNavigation.onCompleted.removeListener(onCompletedPlayer);
  chrome.webNavigation.onBeforeNavigate.removeListener(onbeforePlayer);
  // Sans ça le player terminé restait référencé et l'onglet passait pour un onglet
  // en cours de rejeu (navigations non enregistrées).
  player = null;
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
