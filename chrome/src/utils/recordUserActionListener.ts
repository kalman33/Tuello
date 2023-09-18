export function recordHttpUserActionListener(event: MessageEvent) {
  if (event?.data?.type === 'RECORD_HTTP') {
    if (event.data.error) {
      chrome.runtime.sendMessage({
        action: 'RECORD_HTTP',
        value: { key: event.data.url, reponse: event.data.error, httpCode: event.data.status },
      }, ()=> {});
    } else {
      chrome.runtime.sendMessage({
        action: 'RECORD_HTTP',
        value: { key: event.data.url, reponse: event.data.response, httpCode: event.data.status },
      }, ()=> {});
    }
  }
}
