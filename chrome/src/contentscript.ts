import { IUserAction } from '../../src/app/spy-http/models/UserAction';
import { launchUIRecorderHandler } from './uirecorder';
import * as lightboxImg from './utils/imageviewer';
import * as jsonViewer from './utils/jsonViewer';
import { addMouseCoordinates, removeMouseCoordinates } from './utils/mouse';
import { recordHttpListener } from './utils/recordHttpListener';
import { activateSearchElements, desactivateSearchElements } from './utils/searchElements';
import { addTagsPanel, deleteTagsPanel, initTagsHandler } from './utils/tags';
import { activateRecordTracks, desactivateRecordTracks } from './utils/tracker';
import { run } from './utils/uiplayer';
import { displayEffect } from './utils/utils';

let show = false;
let clickedElement: string;

chrome.storage.local.get(['tuelloRecords', 'deepMockLevel'], function (result) {
  if (result.tuelloRecords) {
    window.postMessage(
      {
        type: 'MOCK_HTTP_TUELLO_RECORDS',
        value: true,
        tuelloRecords: result.tuelloRecords,
        deepMockLevel: result.deepMockLevel || 0
      },
      '*'
    );
  }

});

document.addEventListener("mousedown", function (event) {
  clickedElement = event.target['innerHTML'];
}, true);


chrome.storage.local.get(['disabled'], function (result) {
  if (!result.disabled) {
    document.onreadystatechange = () => {
      if (document.readyState === 'interactive') {
        init();
      }
    };
  } else {
    chrome.runtime.sendMessage({
      action: 'updateIcon',
      value: 'tuello-stop-32x32.png'
    }, () => { });
  }
});

let scriptInjected = false;

function init() {
  return new Promise((resolve, reject) => {
    if (scriptInjected) {
      // Tuello est déjà injecté
      resolve(false);
    } else {
      scriptInjected = true;

      // Import des styles liés au player
      var head = document.head || document.getElementsByTagName("head")[0];
      if (head) {
        head.insertAdjacentHTML(
          'beforeend',
          `<style>
          .tuello-background-color {
            background-color: rgb(209, 37, 102) !important;
            transition: background-color 500ms ease-in-out !important;
          }
          .tuello-white-texte {
            color: white !important;
          }
          .tuello-track:hover { 
            cursor: pointer;
          }
          .tuello-circle {
              pointer-events: none;
              width: 30px; height: 30px;
              border-radius: 100%;
              border: 6px solid #D12566;
              position: fixed;
              z-index: 2147483640;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              animation: ring 1.5s infinite;
          }
          
          @keyframes ring {
            0% {
            width: 30px;
            height: 30px;
            opacity: 1;
            }
            100% {
            width: 100px;
            height: 100px;
            opacity: 0;
            }
          }
          #cover-spin {
            position:fixed;
            width:100%;
            left:0;right:0;top:0;bottom:0;
            z-index:9999;
            display:none;
        }
        
        @-webkit-keyframes spin {
          from {-webkit-transform:rotate(0deg);}
          to {-webkit-transform:rotate(360deg);}
        }
        
        @keyframes spin {
          from {transform:rotate(0deg);}
          to {transform:rotate(360deg);}
        }
        
        #cover-spin::after {
            content:'';
            display:block;
            position:absolute;
            right:15px;top:30px;
            width:40px;height:40px;
            border-style:solid;
            border-color:black;
            border-top-color:transparent;
            border-width: 4px;
            border-radius:50%;
            -webkit-animation: spin .8s linear infinite;
            animation: spin .8s linear infinite;
        }
        
        
          </style>`
        );
      }

      // Gestion du UIRecorder
      launchUIRecorderHandler();


      // ajout du spinner
      const spinner = document.createElement('div');
      spinner.id = 'cover-spin';
      if (document && document.body) {
        document.body.prepend(spinner);
      }


      let iframe;

      // création de l'iframe portant l'app

      if (window.self === window.top) {
        iframe = document.createElement('iframe');
        iframe.id = 'iframeTuello';
        iframe.style.setProperty('height', '100%', 'important');
        iframe.style.setProperty('width', '550px', 'important');
        iframe.style.setProperty('min-width', '1px', 'important');
        iframe.style.setProperty('position', 'fixed', 'important');
        iframe.style.setProperty('top', '0', 'important');
        iframe.style.setProperty('right', '0', 'important');
        iframe.style.setProperty('z-index', '2147483647', 'important');
        iframe.style.setProperty('transform', 'translateX(570px)', 'important');
        iframe.style.setProperty('transition', 'all .4s', 'important');
        iframe.style.setProperty('box-shadow', '0 0 15px 2px rgba(0,0,0,0.12)', 'important');
        iframe.frameBorder = 'none';
        iframe.src = chrome.runtime.getURL('index.html');

        /**iframe.onreadystatechange = () => {
              if ( iframe.readyState == 'complete' ) {
                resolve(true);
              }
            }*/
        iframe.addEventListener('load', event => {
          resolve(true);
        });

        document.body.appendChild(iframe);

        /** 
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          if (msg === 'toggle') {
            show = !show;
            iframe.style.setProperty('transform', show ? 'translateX(0)' : 'translateX(570px)', 'important');
          }
          sendResponse();
          return true;
        });*/
      }
      chrome.storage.local.get(['mouseCoordinates'], results => {
        if (results.mouseCoordinates) {
          addMouseCoordinates();
        }
      });

      chrome.storage.local.get(['trackPlay'], results => {
        if (results.trackPlay) {
          activateRecordTracks();

        }
      });

      chrome.storage.local.get(['searchElementsActivated'], results => {
        if (results['searchElementsActivated']) {
          activateSearchElements();
        }
      });

// on regarde si le mock et le record sont activés et on active la popup le cas échéant
chrome.storage.local.get(['tuelloHTTPTags', 'httpRecord', 'httpMock', 'tuelloRecords', 'deepMockLevel', 'searchElementsActivated'], results => {
  if (results.httpMock) {
    window.postMessage(
      {
        type: 'MOCK_HTTP_ACTIVATED',
        value: true,
        tuelloRecords: results.tuelloRecords,
        deepMockLevel: results.deepMockLevel || 0
      },
      '*'
    );
  }
  if (results.httpRecord) {
    window.postMessage(
      {
        type: 'RECORD_HTTP_ACTIVATED',
        value: true
      },
      '*'
    );
    window.addEventListener('message', recordHttpListener);
  }

  if (results.httpMock) {
    window.postMessage(
      {
        type: 'MOCK_HTTP_ACTIVATED',
        value: true,
        tuelloRecords: results.tuelloRecords,
        deepMockLevel: results.deepMockLevel || 0
      },
      '*'
    );
  }
  if (results['tuelloHTTPTags']) {
    // On initialise le gestionnaire des tags
    initTagsHandler(results['tuelloHTTPTags']);
  }
});


    }
  });
}

// gestion de l'activation et la désactivation du devtools et du record ui
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === 'JSON_VIEWER') {
    const selectedText = window.getSelection().toString();
    let data;
    if (clickedElement.length >= 50) {
      data = clickedElement;
    } else if (selectedText && selectedText.length >= 50) {
      data = selectedText;
    }
    try {
      const json = JSON.parse(data);
      jsonViewer.open(json);
    } catch (e) {
      try {
        const json = JSON.parse(selectedText.replace(/\n/g, '').replaceAll(' ', ''));
        jsonViewer.open(json);
      } catch (e) {
        // error
        console.log('Tuello : La donnée n est pas du json', e);
      }
    }
    sendResponse();

  }
  if (message === 'toggle') {
    if (document.getElementById('iframeTuello')) {
      const transform = window.getComputedStyle(document.getElementById('iframeTuello')).transform;
      if (transform.indexOf('570') >= 0 || transform == 'none') {
        if (document.getElementById('iframeTuello').style.display === 'none') {
          document.getElementById('iframeTuello').style.display = '';
        }
        show = true;
        document.getElementById('iframeTuello').style.setProperty('transform', 'translateX(0)', 'important');
      } else {
        show = false;
        document.getElementById('iframeTuello').style.setProperty('transform', 'translateX(570px)', 'important');
      }
    }
    sendResponse();
  }
  if (message === 'open') {
    show = true;
    document.getElementById('iframeTuello').style.setProperty('transform', 'translateX(0)', 'important');
    sendResponse();
  }
  if (message.from === 'background') {
    if (message.devtools) {
      // on désactive le mock et le record de la popup
      window.postMessage(
        {
          type: 'RECORD_HTTP_ACTIVATED',
          value: false
        },
        '*'
      );
      window.removeEventListener('message', recordHttpListener);
      deleteTagsPanel();

      chrome.storage.local.get(['deepMockLevel'], results => {
        window.postMessage(
          {
            type: 'MOCK_HTTP_ACTIVATED',
            value: false,
            deepMockLevel: results.deepMockLevel || 0
          },
          '*'
        );
      });
      sendResponse();
    } else {
      sendResponse();
    }
  }
  switch (message.action) {
    case 'DEACTIVATE':
      desactivateSearchElements();
      break;
    case 'ACTIVATE':
      init().then(() => {
        if (window.self === window.top) {
          document.getElementById('iframeTuello').style.display = '';
        }
        sendResponse();
      });
      return true;
      break;
    case 'VIEW_IMAGE':
      if (window.self === window.top) {
        lightboxImg.open(message.value);
      }
      sendResponse();
      break;
    case 'HIDE':
      if (window.self === window.top) {
        document.getElementById('iframeTuello').style.display = 'none';
        show = false;
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'HIDE_OK'
          }, () => { });
        }, 1);
      }
      sendResponse();
      break;
    case 'SHOW':
      if (window.self === window.top) {
        show = true;
        document.getElementById('iframeTuello').style.display = '';
      }
      sendResponse();
      break;
    case 'VIEW_CLICK_ACTION':
      const action: IUserAction = message.value;
      displayEffect(action.x, action.y);
      break;

    case 'START_UI_RECORDER':

      launchUIRecorderHandler();
      break;
    case 'MOUSE_COORDINATES':
      if (message.value) {
        addMouseCoordinates();
      } else {
        removeMouseCoordinates();
      }
      sendResponse();
      break;

    case 'HTTP_RECORD_STATE':
      window.postMessage(
        {
          type: 'RECORD_HTTP_ACTIVATED',
          value: message.value
        },
        '*'
      );

      if (message.value) {
        window.addEventListener('message', recordHttpListener);
      } else {
        window.removeEventListener('message', recordHttpListener);
        deleteTagsPanel();
      }
      sendResponse();
      break;

    case 'HTTP_MOCK_STATE':
      chrome.storage.local.get(['tuelloRecords', 'deepMockLevel'], results => {
        window.postMessage(
          {
            type: 'MOCK_HTTP_ACTIVATED',
            value: message.value,
            tuelloRecords: results.tuelloRecords,
            deepMockLevel: results.deepMockLevel || 0
          },
          '*'
        );
        sendResponse();
      });
      break;
    case 'MMA_RECORDS_CHANGE':
      chrome.storage.local.get(['httpMock', 'deepMockLevel', 'tuelloRecords'], results => {
        if (results.httpMock) {
          window.postMessage(
            {
              type: 'MOCK_HTTP_ACTIVATED',
              value: true,
              tuelloRecords: results.tuelloRecords,
              deepMockLevel: results.deepMockLevel || 0
            },
            '*'
          );
        }
        sendResponse();
      });
      break;
    case 'MMA_TAGS_CHANGE':
      chrome.storage.local.get(['tuelloHTTPTags'], results => {
        if (results['tuelloHTTPTags']) {
          // On initialise le gestionnaire des tags
          initTagsHandler(results['tuelloHTTPTags']);
          addTagsPanel(results['tuelloHTTPTags']).then(() => {
            sendResponse();
          })
        }
      });
      break;
    case 'TRACK_PLAY_STATE':
      if (message.value) {
        activateRecordTracks();
      } else {
        desactivateRecordTracks();
      }

      sendResponse();
      break;
    case 'SEARCH_ELEMENTS_ACTIVATED':
      if (message.value) {
        activateSearchElements();
      } else {
        desactivateSearchElements();
      }
      sendResponse();
      break;

    case 'ACTIONS_RESULTS':
      if (window.self === window.top) {
        // SHOW
        document.getElementById('iframeTuello').style.display = '';
        document.getElementById('iframeTuello').style.setProperty('transform', 'translateX(0)', 'important');
        show = true;

        chrome.runtime.sendMessage({
          action: 'updateIcon',
          value: 'tuello-32x32.png'
        }, () => { });

        chrome.runtime.sendMessage({
          action: 'FINISH_PLAY_ACTIONS'
        }, () => { });

        // disabled Mock http
        chrome.runtime.sendMessage({
          action: 'MOCK_HTTP_USER_ACTION',
          value: false
        }, () => { });

        if (message.value && message.value.comparisonResults) {
          // settimeout permet à tuello de s'afficher et permettre d'ecouter ce message
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: 'SHOW_COMPARISON_RESULTS',
              value: message.value.comparisonResults
            }, () => { });
          }, 1);
        }
      }
      sendResponse();
      break;
    case 'PLAY_USER_ACTION':
      run(message.value)
        .then(() => {
          sendResponse();
          return true;
        })
        .catch(() => {
          sendResponse();
          return true;
        });
      return true;
      break;
    case 'MOCK_HTTP_USER_ACTION':
      chrome.storage.local.get(['deepMockLevel'], results => {
        window.postMessage(
          {
            type: 'MOCK_HTTP_ACTIVATED',
            value: message.value,
            tuelloRecords: message.data,
            deepMockLevel: results.deepMockLevel || 0
          },
          '*'
        );
      });
      sendResponse();
      break;
  }
  return true;
});

/**
 * Listener des post message provenant de httpmanager.js
 */
window.addEventListener(
  'message',
  event => {
    if (event?.data?.type) {
      switch (event.data.type) {
        case 'VIEW_IMAGE_CLOSED':
          // send message to popup
          chrome.runtime.sendMessage({
            action: 'VIEW_IMAGE_CLOSED'
          }, () => { });
          break;
      }
    }
  },
  false
);



