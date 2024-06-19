import {
  addComment,
  addHttpUserAction,
  addNavigate,
  addRecordByImage,
  addRecordWindowSize,
  addScreenShot,
  addUserAction,
  deleteRecord,
  loadRecordFromStorage,
  setPause
} from './background/uiRecorderHandler';
import Port = chrome.runtime.Port;
import { Player } from './background/player';
import { UserAction } from './models/UserAction';
import { getBodyFromData, removeDuplicateEntries } from './utils/utils';

let port;
let player = null;


self.addEventListener('activate', event => {
  (self as any).process = {
    versions: {
      node: "test"
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sel') {
    chrome.tabs.sendMessage(
      tab.id,
      'JSON_VIEWER',
      {
        frameId: 0
      },
      () => {
      });
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


async function dynamicallyInjectContentScripts() {
  const contentScriptsToInject = [{
    id: 'hook',
    matches: ['<all_urls>'],
    js: ['httpmanager.js'],
    runAt: 'document_start',
    allFrames: true,
    world: 'MAIN'
  }]

  try {
    // @ts-ignore
    await chrome.scripting.registerContentScripts(contentScriptsToInject);
  } catch (error) {
    console.error(error);
  }
}

function init() {
  dynamicallyInjectContentScripts().then(() => {
    chrome.storage.local.get(['messages'], results => {
      chrome.contextMenus.removeAll(function () {
        if (results.messages) {
          const msgs = results.messages.default;
          chrome.contextMenus.create({
            id: 'sel',
            title: msgs['mmn.spy-http.tabs.shortcuts.jsonviewer'],
            contexts: ['all'],
          }, () => chrome.runtime.lastError); // ignore errors about an existing id

          chrome.contextMenus.create({
            id: 'id0',
            title: msgs['mmn.spy-http.tabs.shortcuts.screenshot'] + " : ALT + MAJ + S",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id1',
            title: msgs['mmn.spy-http.tabs.shortcuts.pause'] + " : ALT + MAJ + P",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id2',
            title: msgs['mmn.spy-http.tabs.shortcuts.resume'] + " : ALT + MAJ + R",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id3',
            title: msgs['mmn.spy-http.tabs.shortcuts.record.by.img'] + " :  ALT + MAJ + click / Coord. + ALT + MAJ + I",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id4',
            title: msgs['mmn.spy-http.tabs.shortcuts.add.comment'] + " :  ALT + MAJ + C",
            contexts: ["all"],
          });
        } else {
          chrome.contextMenus.create({
            id: 'sel',
            title: 'JSON VIEWER',
            contexts: ['all'],
          }, () => chrome.runtime.lastError); // ignore errors about an existing id

          chrome.contextMenus.create({
            id: 'id0',
            title: "Screenshot : ALT + MAJ + S",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id1',
            title: "Pause : ALT + MAJ + P",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id2',
            title: "Resume : ALT + MAJ + R",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id3',
            title: "Rec. by img :  ALT + MAJ + click / Coord. + ALT + MAJ + I",
            contexts: ["all"],
          });
          chrome.contextMenus.create({
            id: 'id4',
            title: "Add comment :  ALT + MAJ + C",
            contexts: ["all"],
          });
        }
      });
    });
  });



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
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
}



// listerner pour le pause et le resume du recorder (les commandes sont déclarées dans le manifest)
chrome.commands.onCommand.addListener(command => {
  switch (command) {
    case 'PAUSE':
      let pausedActionNumber;
      if (player !== null) {
        pausedActionNumber = player.launchAction('PAUSE');
      }
      // message au content script
      chrome.tabs.query({ active: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          'toggle',
          {
            frameId: 0
          },
          () => {
            // message au content script
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'ACTIONS_PAUSED',
              value: pausedActionNumber
            },
              () => { });
          }
        );
      });
      break;
    case 'RESUME':
      // message au content script
      chrome.tabs.query({ active: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
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
    case "DEACTIVATE":
      // on envoie un message au content scrip
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'DEACTIVATE'
      },
        () => { });
      break;
    case 'FINISH_PLAY_ACTIONS':
      // listener de navigation : permet de désactiver et réactiver le player le temps que le dom se charge dans la nouvelle page
      chrome.webNavigation.onCompleted.removeListener(onCompletedPlayer);
      chrome.webNavigation.onBeforeNavigate.removeListener(onbeforePlayer);
      break;
    case 'LOAD_UI_RECORDERS':
      // on charge les enregistrements du local storage : uniquement pour la frame principale
      if (sender.frameId === 0) {
        loadRecordFromStorage();
      }
      break;
    case 'START_UI_RECORDER':
      // on envoie un message au content scrip
      if (sender && sender.tab && sender.tab.id >= 0) {
        chrome.tabs.sendMessage(
          sender.tab.id,
          {
            action: 'START_UI_RECORDER',
            value: msg.value
          },
          () => { }
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
          () => { }
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
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'MOUSE_COORDINATES',
          value: msg.value
        },
          () => { });
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
          () => { }
        );
      }
      break;

    case 'HTTP_MOCK_STATE':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'HTTP_MOCK_STATE',
          value: msg.value
        },
          () => { });
      }
      break;
    case 'UPDATE_MENU':
      if (sender && sender.tab && sender.tab.id >= 0) {
        chrome.storage.local.get(['messages'], results => {
          if (results.messages) {
            const msgs = results.messages.default;
            chrome.contextMenus.update('id0', {
              title: msgs['mmn.spy-http.tabs.shortcuts.screenshot'] + " : ALT + MAJ + S",
              contexts: ["all"],
            });
            chrome.contextMenus.update('id1', {
              title: msgs['mmn.spy-http.tabs.shortcuts.pause'] + " : ALT + MAJ + P",
              contexts: ["all"],
            });
            chrome.contextMenus.update('id2', {
              title: msgs['mmn.spy-http.tabs.shortcuts.resume'] + " : ALT + MAJ + R",
              contexts: ["all"],
            });
            chrome.contextMenus.update('id3', {
              title: msgs['mmn.spy-http.tabs.shortcuts.record.by.img'] + " :  ALT + MAJ + click / Coord. + ALT + MAJ + I",
              contexts: ["all"],
            });
            chrome.contextMenus.update('id4', {
              title: msgs['mmn.spy-http.tabs.shortcuts.add.comment'] + " :  ALT + MAJ + C",
              contexts: ["all"],
            });
          }
        });
      }
      break;
    case 'HTTP_RECORD_STATE':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'HTTP_RECORD_STATE',
          value: msg.value
        },
          () => { });
      }
      break;
    case 'MMA_RECORDS_CHANGE':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'MMA_RECORDS_CHANGE'
        },
          () => { });
      }
      break;
    case 'MMA_TAGS_CHANGE':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'MMA_TAGS_CHANGE'
        },
          () => { });
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
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'TRACK_PLAY_STATE',
          value: msg.value
        },
          () => { });


      }
      break;
    case 'SEARCH_ELEMENTS_ACTIVATED':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'SEARCH_ELEMENTS_ACTIVATED',
          value: msg.value
        },
          () => { });
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
          () => { }
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
          () => { }
        );
      }
      break;
    case 'PLAY_ACTION_ERROR':
      chrome.action.setIcon({ path: '/assets/logos/tuello-32x32.png' });
      let pausedActionNumber;
      if (player !== null) {
        pausedActionNumber = player.launchAction('PAUSE');
      }
      // message au content script
      chrome.tabs.query({ active: true }, function (tabs) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          'toggle',
          {
            frameId: 0
          },
          () => {
            // message au content script
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'ACTIONS_PAUSED',
              value: pausedActionNumber
            },
              () => { });
          }
        );
      });

      // on doit faire un scroll vers  le haut sur toutes les frames
      chrome.webNavigation.getAllFrames(
        {
          tabId: sender.tab.id
        },
        frames => {
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
              () => { }
            );
          }
        }
      );

      break;
    case 'toggle':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(sender.tab.id, 'toggle', {
          frameId: 0
        },
          () => { });
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
        frames => {
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
              () => { }
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
              () => { }
            );
          }
        }
      );

      break;
    case 'PLAY_USER_ACTIONS':
      if (player) {
        player.launchAction('RESET');
      }
      player = new Player(msg.value, sender.tab.id, senderResponse);
      player.launchAction('PLAY');
      break;
    case 'MOCK_HTTP_USER_ACTION':
      if (sender && sender.tab && sender.tab.id >= 0) {
        // on envoie un message au content scrip
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'MOCK_HTTP_USER_ACTION',
          value: msg.value,
          data: msg.data
        },
          () => { });
      } else {
        port.postMessage({
          action: 'MOCK_HTTP_USER_ACTION',
          value: msg.value,
          data: msg.data
        },
          () => { });
      }
      break;
    case 'ACTIVATE':
      chrome.tabs.query({ active: true }, tabs => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'ACTIVATE'
          },
          {
            frameId: 0
          },
          () =>
            chrome.tabs.sendMessage(
              tabs[0].id,
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
      break;
    case 'RECORD_USER_ACTION':
      addUserAction(msg.value, sender.tab.id, sender.frameId);
      break;
    case 'RECORD_BY_IMAGE_ACTION':
      addRecordByImage(msg.value, sender.tab.id, sender.frameId);
      senderResponse();
      break;
    case 'SCREENSHOT_ACTION':
      addScreenShot(sender.tab.id, msg.value).then(ret => senderResponse());
      break;
    case 'COMMENT_ACTION':
      addComment(msg.value);
      senderResponse();
      break;
    case 'PAUSE_OTHER_ACTIONS_FOR_COMMENT_ACTION':
      setPause(msg.value);
      break;
    case 'RECORD_WINDOW_SIZE':
      chrome.windows.getCurrent((windowInfos) => {
        let data = {
          width: windowInfos.width,
          height: windowInfos.height,
          top: windowInfos.top,
          left: windowInfos.left
        };
        addRecordWindowSize(data);
      });
      chrome.tabs.query({ active: true }, function (tabs) {
        if (tabs.length > 0) {
          const activeTab = tabs[0];
          const url = activeTab?.url;
          const action = new UserAction(null);
          action.type = "navigation";
          action.hrefLocation = url;
          addNavigate(action, tabs[0].id, 0);
        } else {
          console.error("No active tab found.");

        }
      });

      break;
    case 'RECORD_HTTP':
      addHttpUserAction(msg.value);
      break;
    case 'RECORD_USER_ACTION_DELETE':
      deleteRecord();
      break;
  }
  return true;
});


/**
 * fonction exécutée avant une navigation ou une navigation d'une iframe
 * permet de désactiver le player
 */
function onbeforePlayer(details) {
  if (details.frameId === 0) {
    let pausedActionNumber;
    if (player !== null) {
      pausedActionNumber = player.launchAction('PAUSE');
    }
  }

}

/**
 * fonction exécutée apres une navigation ou une navigation d'une iframe
 * permet de réactiver le player
 */
function onCompletedPlayer(details) {
  if (details.frameId === 0) {
    if (player !== null) {
      player.launchAction('PLAY');

    }
  }
}



