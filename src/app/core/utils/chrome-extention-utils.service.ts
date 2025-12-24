import {Injectable} from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChromeExtentionUtilsService {

  public imageViewerOpened = false;
  public devtoolsOpened = false;

  /**
   * permet de cacher le plugin chrome
   */
  public hide(): Promise<string> {
    chrome.runtime.sendMessage({
      action: 'HIDE'
    }, ()=>{});
    return new Promise((resolve, reject) => {
      const listener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'HIDE_OK'){
          chrome.runtime.onMessage.removeListener(listener);
          resolve('success');
        }
        sendResponse();
      };
      chrome.runtime.onMessage.addListener(listener);
    });
  }

  /**
   * permet de basculer le plugin chrome
   */
  public toggle() {
    chrome.runtime.sendMessage({
      action: 'toggle'
    }, ()=>{});

  }

  /**
   * permet de cacher le plugin chrome
   */
  public show() {
    chrome.runtime.sendMessage({
      action: 'SHOW'
    }, ()=>{});
  }

  public openImageViewer(img: string) {
    if (!this.imageViewerOpened) {
      this.imageViewerOpened = true;
      this.hide();
      chrome.runtime.sendMessage({
        action: 'VIEW_IMAGE',
        value: img,
      }, ()=>{});
    }
  }


}
