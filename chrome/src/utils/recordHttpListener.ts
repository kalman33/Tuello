import { removeDuplicateEntries } from './utils';

export function recordHttpListener(event: MessageEvent) {
  if (event?.data?.type === 'RECORD_HTTP') {
    chrome.storage.local.get(['tuelloRecords'], items => {
      if (!chrome.runtime.lastError) {
        if (!items.tuelloRecords || !Array.isArray(items.tuelloRecords)) {
          items.tuelloRecords = [];
        }
        if (event.data.error) {
          items.tuelloRecords.unshift({ key: event.data.url, reponse: event.data.error, httpCode: event.data.status, delay: event.data.delay });
        } else {
          items.tuelloRecords.unshift({ key: event.data.url, reponse: event.data.response, httpCode: event.data.status, delay: event.data.delay });
        }

        chrome.storage.local.set({ tuelloRecords: removeDuplicateEntries(items.tuelloRecords) }, () => {
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
