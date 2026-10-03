export function recordConsoleLogListener(event: MessageEvent) {
  if (event?.data?.type === 'RECORD_CONSOLE_LOG_BATCH' && Array.isArray(event.data.entries)) {
    chrome.runtime.sendMessage(
      {
        action: 'RECORD_CONSOLE_LOG',
        value: event.data.entries
      },
      () => {}
    );
  }
}
