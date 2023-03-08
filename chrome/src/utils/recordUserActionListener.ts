export function recordHttpUserActionListener(event: MessageEvent) {
  if (event?.data?.type === 'RECORD_HTTP') {
    if (event.data.error) {
      chrome.runtime.sendMessage({
        action: 'RECORD_HTTP',
        value: { key: event.data.url, reponse: event.data.error, retourHttp: event.data.status },
      }, ()=> {});
    } else {
      chrome.runtime.sendMessage({
        action: 'RECORD_HTTP',
        value: { key: event.data.url, reponse: event.data.response, retourHttp: event.data.status },
      }, ()=> {});
    }
  }
}
