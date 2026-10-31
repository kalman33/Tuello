export function recordHttpUserActionListener(event: MessageEvent) {
  if (event?.data?.type === 'RECORD_HTTP') {
    chrome.runtime.sendMessage(
      {
        action: 'RECORD_HTTP',
        value: {
          key: event.data.url,
          response: event.data.error || event.data.response,
          httpCode: event.data.status,
          headers: event.data.headers,
          requestHeaders: event.data.requestHeaders,
          delay: event.data.delay,
          method: event.data.method,
          duration: event.data.duration,
          body: event.data.body,
          timestamp: event.data.timestamp,
          requestId: event.data.requestId,
          // Niveau de frame (0 = page principale) : au rejeu, la réponse ne sert qu'aux requêtes de ce niveau
          frameLevel: typeof event.data.frameLevel === 'number' ? event.data.frameLevel : undefined
        }
      },
      () => {}
    );
  }
}
