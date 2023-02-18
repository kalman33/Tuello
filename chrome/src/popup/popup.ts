// var enableCheckbox = document.getElementById('myonoffswitch');
// read storage, Change button's text
chrome.storage.local.get(['disabled'], function(result) {
  if (!result.disabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action: 'ACTIVATE'
        },
        () =>
          chrome.tabs.sendMessage(
            tabs[0].id,
            'toggle',
            {
              frameId: 0
            },
            () => window.close()
          )
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
          chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            chrome.runtime.sendMessage({
              action: 'updateIcon',
              value: 'tuello-32x32.png'
            });

            chrome.tabs.sendMessage(
              tabs[0].id,
              {
                action: 'ACTIVATE'
              },
              () => {
                chrome.tabs.sendMessage(tabs[0].id, 'toggle', () => {
                  window.close();
                });
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
