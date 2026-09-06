const MOSAIC_URL = chrome.runtime.getURL('mosaic/mosaic.html');

function isRestrictedUrl(url: string): boolean {
  return url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('edge://');
}

// var enableCheckbox = document.getElementById('myonoffswitch');
// read storage, Change button's text
chrome.storage.local.get(['disabled'], function (result) {
  if (!result.disabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0].url ?? '';
      if (isRestrictedUrl(url)) {
        // Aucun site à instrumenter (nouvel onglet, chrome://, page d'extension) : on ouvre
        // la mosaïque. Depuis la mosaïque elle-même, on bascule sur le panneau Tuello.
        chrome.tabs.create({ url: url.startsWith(MOSAIC_URL) ? chrome.runtime.getURL('index.html') : MOSAIC_URL });
        window.close();
        return;
      }
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action: 'ACTIVATE'
        },
        () => {
          if (chrome.runtime.lastError) {
            window.close();
          } else {
            chrome.tabs.sendMessage(
              tabs[0].id,
              'toggle',
              {
                frameId: 0
              },
              () => window.close()
            );
          }
        }
      );
    });
  } else {
    document.getElementById('main').style.display = '';
  }
});

document.addEventListener(
  'DOMContentLoaded',
  () => {
    let enableCheckbox = document.querySelector('.onoffswitch-switch');

    // Enable checkbox
    enableCheckbox.addEventListener(
      'transitionend',
      () => {
        chrome.storage.local.set({ disabled: false }, () =>
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.runtime.sendMessage(
              {
                action: 'updateIcon',
                value: 'tuello-32x32.png'
              },
              () => {}
            );

            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                action: 'ACTIVATE'
              },
              () => {
                if (!chrome.runtime.lastError) {
                  chrome.tabs.sendMessage(tabs[0].id, 'toggle', () => {
                    window.close();
                  });
                }
              }
            );
          })
        );
      },
      false
    );
  },
  false
);
