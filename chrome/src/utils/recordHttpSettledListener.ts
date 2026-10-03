import { logData } from './utils';

export function recordHttpSettledListener(event: MessageEvent) {
  if (event?.data?.type === 'HTTP_SETTLED' && typeof event.data.requestId === 'string') {
    logData(`- Capture auto HTTP - Relais HTTP_SETTLED_SCREENSHOT pour ${event.data.requestId}`);
    chrome.runtime.sendMessage(
      {
        action: 'HTTP_SETTLED_SCREENSHOT',
        value: { requestId: event.data.requestId }
      },
      () => {}
    );
  }
}
