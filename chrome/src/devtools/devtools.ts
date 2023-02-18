// Create a connection to the background page : permet de gérer l'ouverture et la fermeture du devtools
import { postMessage } from './communication';
import { removeDuplicateEntries } from '../utils/utils';
import { importFunc } from './importFunc';

/**
 * Creation du devtools panels
 */
chrome.devtools.inspectedWindow.eval('window.location.href', (result: string, error) => {
  if (!error) {
    if (result.includes('file://')) {
      chrome.devtools.panels.create('Tuello', null, 'index.html', panel => {
        init(panel);
      });
    }
  }
});

/*
let onHeadersReceived = function (details) {
  console.log('HEADER---', details);

  for (let i = 0; i < details.responseHeaders.length; i++) {
    if (details.responseHeaders[i].name.toLowerCase() === 'content-security-policy') {
      details.responseHeaders[i].value = '';
    }
  }

  return {
    responseHeaders: details.responseHeaders
  };
};
*/
function init(panel) {

  // let onHeaderFilter = { urls: ['*://*/*'], types: ['main_frame', 'sub_frame'] };
  // chrome.webRequest.onHeadersReceived.addListener(
  //   onHeadersReceived, ( onHeaderFilter as any), ['blocking', 'responseHeaders']
  // );


  // gestion pour indiquer à tuello qu'on est en mode devtools ou pas
    var _window; // Going to hold the reference to panel.html's `window
    
    panel.onShown.addListener(function tmp(panelWindow) {
        panel.onShown.removeListener(tmp); // Run once only
        _window = panelWindow;
        _window['devtools-page'] = true;
    });

  // inject import
  chrome.devtools.inspectedWindow.eval('(' + importFunc.toString() + ')()', (result, isException) => {
  });

  // intercepteur des requetes envoyées par le background sender
  chrome.devtools.network.onRequestFinished.addListener(backgroundSenderListener);

  // on regarde si le mock et le record sont activés et on active la popup le cas échéant
  chrome.storage.local.get(['httpRecord', 'httpMock', 'mmaRecords', 'deepMockLevel'], results => {
    if (results.httpMock) {
      postMessage({
        type: 'MOCK_HTTP_ACTIVATED',
        value: true,
        mmaRecords: results.mmaRecords,
        deepMockLevel: results.deepMockLevel || 0
      });
    }
    if (results.httpRecord) {
      postMessage({
        type: 'RECORD_HTTP_ACTIVATED',
        value: true
      });
      chrome.devtools.network.onRequestFinished.addListener(recordHttpListener);
    }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    for (const key of Object.keys(changes)) {
      const storageChange = changes[key];
      console.log(
        'Storage key "%s" in namespace "%s" changed. ' + 'Old value was "%s", new value is "%s".',
        key,
        namespace,
        storageChange.oldValue,
        storageChange.newValue
      );

      switch (key) {
        case 'httpRecord':
          postMessage({
            type: 'RECORD_HTTP_ACTIVATED',
            value: storageChange.newValue
          });
          if (storageChange.newValue) {
            chrome.devtools.network.onRequestFinished.addListener(recordHttpListener);
          } else {
            chrome.devtools.network.onRequestFinished.removeListener(recordHttpListener);
          }
          break;
        case 'httpMock':
          chrome.storage.local.get(['mmaRecords', 'deepMockLevel'], results => {
            postMessage({
              type: 'MOCK_HTTP_ACTIVATED',
              value: storageChange.newValue,
              mmaRecords: results.mmaRecords,
              deepMockLevel: results.deepMockLevel || 0
            });
          });
          break;
        case 'mmaRecords':
          chrome.storage.local.get(['httpMock', 'deepMockLevel'], results => {
            if (results.httpMock) {
              postMessage({
                type: 'MOCK_HTTP_ACTIVATED',
                value: true,
                mmaRecords: storageChange.newValue,
                deepMockLevel: results.deepMockLevel || 0
              });
            }
          });
          break;
      }
    }
  });
}

function backgroundSenderListener(request) {
  request.getContent(body => {
    if (request.request && request.request.url && request.request.method === 'POST' && request.request.url.includes('tuello')) {
      const data = JSON.parse(request.request.postData.text);
      switch (data.type) {
        case 'RECORD_HTTP_READY':
          // init : on regarde si le mode enregistrement est activé pour prévenir httprecord
          chrome.storage.local.get(['httpRecord'], results => {
            if (results.httpRecord) {
              postMessage({
                type: 'RECORD_HTTP_ACTIVATED',
                value: true
              });
              chrome.devtools.network.onRequestFinished.addListener(recordHttpListener);
            }
          });
          break;

        case 'RECORD_MOCK_READY':
          // init : on regarde si le mode mock est activé pour prévenir httpmock
          chrome.storage.local.get(['httpMock', 'mmaRecords', 'deepMockLevel'], results => {
            if (results.httpMock) {
              postMessage({
                type: 'MOCK_HTTP_ACTIVATED',
                value: true,
                mmaRecords: results.mmaRecords,
                deepMockLevel: results.deepMockLevel || 0
              });
            }
          });

          break;
      }
    }
  });
}

function recordHttpListener(request) {
  request.getContent(body => {
    if (request.request && request.request.url && request.request.method === 'POST' && request.request.url.includes('tuello')) {
      const data = JSON.parse(request.request.postData.text);
      if (data.type === 'RECORD_HTTP') {
        chrome.storage.local.get(['mmaRecords'], items => {
          if (!chrome.runtime.lastError) {
            if (!items.mmaRecords) {
              items.mmaRecords = [];
            }
            if (data.error) {
              items.mmaRecords.unshift({ key: data.url, reponse: data.error, retourHttp: data.status });
            } else {
              items.mmaRecords.unshift({ key: data.url, reponse: data.response, retourHttp: data.status });
            }

            chrome.storage.local.set({ mmaRecords: removeDuplicateEntries(items.mmaRecords) }, () => {
              chrome.runtime.sendMessage(
                {
                  refresh: true
                },
                response => {
                }
              );
            });
          }
        });
      }
    }
  });
}

/**
 * listener sur le storage chrome.
 * permet de prévenir le httpmock et le httprecorder qu'on a activé ou désactivé le mode mock
 * ou le mode enregistrement
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  for (const key of Object.keys(changes)) {
    const storageChange = changes[key];
    console.log(
      'Storage key "%s" in namespace "%s" changed. ' + 'Old value was "%s", new value is "%s".',
      key,
      namespace,
      storageChange.oldValue,
      storageChange.newValue
    );

    switch (key) {
      case 'httpRecord':
        postMessage({
          type: 'RECORD_HTTP_ACTIVATED',
          value: storageChange.newValue
        });
        if (storageChange.newValue) {
          chrome.devtools.network.onRequestFinished.addListener(recordHttpListener);
        } else {
          chrome.devtools.network.onRequestFinished.addListener(recordHttpListener);
        }
        break;
      case 'httpMock':
        chrome.storage.local.get(['mmaRecords', 'deepMockLevel'], results => {
          postMessage({
            type: 'MOCK_HTTP_ACTIVATED',
            value: storageChange.newValue,
            mmaRecords: results.mmaRecords,
            deepMockLevel: results.deepMockLevel || 0
          });
        });
        break;
      case 'mmaRecords':
        chrome.storage.local.get(['httpMock', 'deepMockLevel'], results => {
          if (results.httpMock) {
            postMessage({
              type: 'MOCK_HTTP_ACTIVATED',
              value: true,
              mmaRecords: storageChange.newValue,
              deepMockLevel: results.deepMockLevel || 0
            });
          }
        });
        break;
    }
  }
});
