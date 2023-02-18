import {removeDuplicateEntries} from './utils';

export function recordHttpListener(event: MessageEvent) {
  if (event.data.type === 'RECORD_HTTP') {
    chrome.storage.local.get(['mmaRecords'], items => {
      if (!chrome.runtime.lastError) {
        if (!items.mmaRecords) {
          items.mmaRecords = [];
        }
        if (event.data.error) {
          items.mmaRecords.unshift({ key: event.data.url, reponse: event.data.error, retourHttp: event.data.status });
        } else {
          items.mmaRecords.unshift({ key: event.data.url, reponse: event.data.response, retourHttp: event.data.status });
        }

        chrome.storage.local.set({ mmaRecords: removeDuplicateEntries(items.mmaRecords) }, () => {
          chrome.runtime.sendMessage(
            {
              refresh: true,
            },
            response => {
            },
          );
        });
      }
    });
  }
}
