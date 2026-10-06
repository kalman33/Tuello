export function recordHttpUserActionListener(event: MessageEvent) {
  if (event?.data?.type === 'RECORD_HTTP') {
    if (event.data.error) {
      chrome.runtime.sendMessage(
        {
          action: 'RECORD_HTTP',
          value: {
            key: event.data.url,
            response: event.data.error,
            httpCode: event.data.status,
            headers: event.data.headers,
            requestHeaders: event.data.requestHeaders,
            delay: event.data.delay,
            method: event.data.method,
            duration: event.data.duration,
            body: event.data.body,
            timestamp: event.data.timestamp,
            requestId: event.data.requestId
          }
        },
        () => {}
      );
    } else {
      chrome.runtime.sendMessage(
        {
          action: 'RECORD_HTTP',
          value: {
            key: event.data.url,
            response: event.data.response,
            httpCode: event.data.status,
            headers: event.data.headers,
            requestHeaders: event.data.requestHeaders,
            delay: event.data.delay,
            method: event.data.method,
            duration: event.data.duration,
            body: event.data.body,
            timestamp: event.data.timestamp,
            requestId: event.data.requestId
          }
        },
        () => {}
      );
    }
  }
}
