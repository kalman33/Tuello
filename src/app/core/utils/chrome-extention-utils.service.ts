import { Injectable } from '@angular/core';

/**
 * Onglet piloté quand l'app tourne dans le panneau latéral de Chrome (iframe de
 * sidepanel.html, qui lui transmet ?sidepanel=<tabId>), null dans la page ou un onglet.
 * Lu au chargement du module, avant que le routeur ne réécrive l'URL.
 */
const SIDE_PANEL_TAB_ID: number | null = (() => {
  const value = new URLSearchParams(window.location.search).get('sidepanel');
  return value !== null && Number.isInteger(Number(value)) ? Number(value) : null;
})();

@Injectable({ providedIn: 'root' })
export class ChromeExtentionUtilsService {
  public imageViewerOpened = false;
  public devtoolsOpened = false;
  /** Vrai quand Tuello s'ouvre en onglet plein écran (pas dans une iframe) */
  public isStandaloneTab = window === window.top && SIDE_PANEL_TAB_ID === null;
  /** Vrai dans le panneau latéral de Chrome (pages sans site, comme le nouvel onglet) */
  public isSidePanel = SIDE_PANEL_TAB_ID !== null;
  public sidePanelTabId = SIDE_PANEL_TAB_ID;

  /**
   * Ferme le panneau latéral. sidePanel.close n'existe qu'à partir de Chrome 141 :
   * avant, on ferme la page hôte (sidepanel.html), dont l'app est une iframe.
   */
  public closeSidePanel(): void {
    const closeHost = () => window.top.close();
    if (this.sidePanelTabId !== null && chrome.sidePanel?.close) {
      chrome.sidePanel.close({ tabId: this.sidePanelTabId }).catch(closeHost);
      return;
    }
    closeHost();
  }

  /**
   * permet de cacher le plugin chrome
   */
  public hide(): Promise<string> {
    // Le panneau latéral ne recouvre pas la page : rien à cacher avant une capture
    if (this.isSidePanel) {
      return Promise.resolve('success');
    }
    chrome.runtime.sendMessage(
      {
        action: 'HIDE'
      },
      () => {}
    );
    return new Promise((resolve, reject) => {
      const listener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (message.action === 'HIDE_OK') {
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
    // Basculer viserait l'iframe de la page, qui s'ouvrirait en plus du panneau latéral
    if (this.isSidePanel) {
      return;
    }
    chrome.runtime.sendMessage(
      {
        action: 'toggle'
      },
      () => {}
    );
  }

  /**
   * permet de cacher le plugin chrome
   */
  public show() {
    if (this.isSidePanel) {
      return;
    }
    chrome.runtime.sendMessage(
      {
        action: 'SHOW'
      },
      () => {}
    );
  }

  public openImageViewer(img: string) {
    if (!this.imageViewerOpened) {
      this.imageViewerOpened = true;
      this.hide();
      chrome.runtime.sendMessage(
        {
          action: 'VIEW_IMAGE',
          value: img
        },
        () => {}
      );
    }
  }
}
