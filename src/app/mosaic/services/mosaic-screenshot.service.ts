import { Injectable } from '@angular/core';
import { MOSAIC_SCREENSHOT_PREFIX } from '../models/mosaic.models';

@Injectable({ providedIn: 'root' })
export class MosaicScreenshotService {
  async openAndCapture(url: string, urlId: string): Promise<boolean> {
    const mosaicTabId = await this.getCurrentTabId();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'MOSAIC_OPEN_AND_CAPTURE', url, urlId, mosaicTabId }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(response?.success ?? false);
      });
    });
  }

  private getCurrentTabId(): Promise<number> {
    return new Promise((resolve) => {
      chrome.tabs.getCurrent((tab) => resolve(tab?.id ?? -1));
    });
  }

  async getScreenshot(urlId: string): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get([MOSAIC_SCREENSHOT_PREFIX + urlId], (result) => {
        resolve(result[MOSAIC_SCREENSHOT_PREFIX + urlId] ?? null);
      });
    });
  }

  async deleteScreenshot(urlId: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove([MOSAIC_SCREENSHOT_PREFIX + urlId], resolve);
    });
  }

  async cleanupOrphanedScreenshots(activeUrlIds: string[]): Promise<void> {
    const all = await new Promise<Record<string, any>>((resolve) => {
      chrome.storage.local.get(null, resolve);
    });
    const orphanedKeys = Object.keys(all).filter((key) => key.startsWith(MOSAIC_SCREENSHOT_PREFIX) && !activeUrlIds.includes(key.slice(MOSAIC_SCREENSHOT_PREFIX.length)));
    if (orphanedKeys.length) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.remove(orphanedKeys, resolve);
      });
    }
  }
}
