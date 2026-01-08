import { Action } from '../../../src/app/spy-http/models/Action';
import { ComparisonResult } from '../models/ComparisonResult';
import { IFrame } from '../models/IFrame';
import { getFrameIdFromSrc } from './uiRecorderHandler';
import { UserAction } from '../models/UserAction';
import { PNG } from 'pngjs/browser';
import pixelmatch from "pixelmatch";
import { Buffer } from 'buffer';

/** Timeout par défaut pour les actions en ms */
const ACTION_TIMEOUT_MS = 30000;

/** Délai d'attente avant capture screenshot pour s'assurer du rendu complet */
const SCREENSHOT_RENDER_DELAY_MS = 300;

/** Dimensions minimales et maximales pour la fenêtre */
const MIN_WINDOW_SIZE = 100;
const MAX_WINDOW_SIZE = 10000;

/** Résultat d'une action */
interface ActionResult {
  success: boolean;
  actionIndex: number;
  actionType: string;
  error?: string;
}

export class Player {
  yieldActions: Generator<Action>;
  initialActions: Action[];
  timeoutId: ReturnType<typeof setTimeout> | null = null;
  pauseCurrentAction = false;
  chromeTabId: number;
  count = 0;
  comparisonResults: ComparisonResult[];
  actionResults: ActionResult[] = [];
  private isDestroyed = false;

  constructor(actions: Action[], chromeTabId: number, senderResponse: (response?: any) => void) {
    this.initialActions = actions;
    this.chromeTabId = chromeTabId;
    this.yieldActions = this.iterateGenerator(actions);
  }

  /**
   * Nettoie les ressources du player
   */
  destroy(): void {
    this.isDestroyed = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private startTimeout(): void {
    if (this.isDestroyed) return;

    const currentAction = this.initialActions[this.count];
    if (currentAction?.delay !== undefined && currentAction?.delay !== null) {
      this.timeoutId = setTimeout(() => this.treatAction(), currentAction.delay);
    }
  }

  async treatAction(): Promise<void> {
    if (this.isDestroyed) return;

    const action = this.yieldActions.next();
    const currentIndex = this.count;
    this.count++;

    const userAction = action.value?.userAction ?? null;

    if (action.done) {
      this.cleanup();
      this.sendResults();
      return;
    }

    let actionSuccess = true;
    let actionError: string | undefined;

    try {
      if (action.value.actionType === 'NAVIGATE') {
        actionSuccess = await this.handleNavigate(userAction);
      } else if (action.value.actionType === 'SCREENSHOT') {
        if (!this.comparisonResults) {
          this.comparisonResults = [];
        }
        actionSuccess = await this.compareImage(action.value);
      } else if (action.value.actionType !== 'COMMENT') {
        actionSuccess = await this.handleUserAction(userAction);
      }
    } catch (error) {
      actionSuccess = false;
      actionError = error instanceof Error ? error.message : String(error);
      console.warn(`Erreur action ${action.value.actionType}:`, error);
    }

    // Enregistrer le résultat de l'action
    this.actionResults.push({
      success: actionSuccess,
      actionIndex: currentIndex,
      actionType: action.value.actionType,
      error: actionError
    });

    // Continuer si pas en pause et pas détruit
    if (!this.pauseCurrentAction && !this.isDestroyed) {
      this.scheduleNextAction();
    }
  }

  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.count = 0;
  }

  private sendResults(): void {
    // Log des actions échouées pour debug
    const failedActions = this.actionResults.filter(r => !r.success);
    if (failedActions.length > 0) {
      console.warn(`${failedActions.length} action(s) ont échoué:`, failedActions);
    }

    chrome.tabs.sendMessage(this.chromeTabId, {
      action: 'ACTIONS_RESULTS',
      value: {
        comparisonResults: this.comparisonResults,
        actionResults: this.actionResults
      }
    }, {
      frameId: 0
    }, () => {
      if (chrome.runtime.lastError) {
        // Ignorer - l'onglet peut être fermé
      }
    });
  }

  private async handleNavigate(userAction: UserAction): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs[0]?.id) {
          console.warn('Erreur navigation: onglet non trouvé');
          resolve(false);
          return;
        }

        chrome.tabs.update(tabs[0].id, { url: userAction.hrefLocation }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Erreur navigation:', chrome.runtime.lastError.message);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    });
  }

  private async handleUserAction(userAction: UserAction): Promise<boolean> {
    let options: chrome.tabs.MessageSendOptions = { frameId: 0 };

    // Déterminer l'iframe cible
    if (userAction.frame?.src && userAction.frame.frameId > 0) {
      try {
        const iframe = await getFrameIdFromSrc(this.chromeTabId, userAction.frame.src);
        options = { frameId: iframe.frameId };
      } catch {
        // Frame non trouvée, utiliser le frame principal
        options = { frameId: 0 };
      }
    }

    return this.sendMessageToContent(userAction, options);
  }

  private scheduleNextAction(): void {
    if (this.isDestroyed) return;

    const nextAction = this.initialActions[this.count];
    const currentAction = this.initialActions[this.count - 1];
    const delay = nextAction?.delay ?? currentAction?.delay ?? 0;

    this.timeoutId = setTimeout(() => this.treatAction(), delay);
  }

  *iterateGenerator(actions: Action[]) {
    for (const action of actions) {
      yield action;
    }
  }

  launchAction(state: string): number {
    switch (state) {
      case 'PLAY':
        this.pauseCurrentAction = false;
        this.startTimeout();
        break;
      case 'PAUSE':
        this.pauseCurrentAction = true;
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        break;
      case 'RESET':
        this.pauseCurrentAction = false;
        this.yieldActions = this.iterateGenerator(this.initialActions);
        this.actionResults = [];
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        break;
      default:
        this.pauseCurrentAction = false;
        this.startTimeout();
        break;
    }
    return this.count;
  }

  /**
   * Valide les dimensions de la fenêtre
   */
  private validateWindowDimensions(dimensions: { width?: number; height?: number; top?: number; left?: number }): boolean {
    const { width, height, top, left } = dimensions;

    if (width !== undefined && (width < MIN_WINDOW_SIZE || width > MAX_WINDOW_SIZE)) {
      console.warn(`Largeur invalide: ${width}`);
      return false;
    }
    if (height !== undefined && (height < MIN_WINDOW_SIZE || height > MAX_WINDOW_SIZE)) {
      console.warn(`Hauteur invalide: ${height}`);
      return false;
    }
    if (top !== undefined && (top < -MAX_WINDOW_SIZE || top > MAX_WINDOW_SIZE)) {
      console.warn(`Position top invalide: ${top}`);
      return false;
    }
    if (left !== undefined && (left < -MAX_WINDOW_SIZE || left > MAX_WINDOW_SIZE)) {
      console.warn(`Position left invalide: ${left}`);
      return false;
    }

    return true;
  }

  sendMessageToContent(userAction: UserAction, options?: chrome.tabs.MessageSendOptions): Promise<boolean> {
    return new Promise((resolve) => {
      // Créer un timeout pour éviter de bloquer indéfiniment
      const timeoutId = setTimeout(() => {
        console.warn(`Timeout atteint pour l'action: ${userAction.type}`);
        resolve(false);
      }, ACTION_TIMEOUT_MS);

      if (userAction.type === 'resize') {
        // Valider les dimensions avant de redimensionner
        if (!this.validateWindowDimensions(userAction.htmlCoordinates)) {
          clearTimeout(timeoutId);
          resolve(false);
          return;
        }

        chrome.windows.getCurrent((window) => {
          if (chrome.runtime.lastError || !window?.id) {
            clearTimeout(timeoutId);
            console.warn('Erreur récupération fenêtre:', chrome.runtime.lastError?.message);
            resolve(false);
            return;
          }

          const updateInfo: chrome.windows.UpdateInfo = {
            width: userAction.htmlCoordinates.width,
            height: userAction.htmlCoordinates.height,
            top: userAction.htmlCoordinates.top,
            left: userAction.htmlCoordinates.left,
            state: "normal"
          };

          chrome.windows.update(window.id, updateInfo, (updatedWindow) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
              console.warn('Erreur redimensionnement:', chrome.runtime.lastError.message);
              resolve(false);
            } else {
              resolve(true);
            }
          });
        });
      } else {
        // Vérifier que l'onglet existe encore
        chrome.tabs.get(this.chromeTabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            clearTimeout(timeoutId);
            console.warn('Onglet fermé ou introuvable:', chrome.runtime.lastError?.message);
            resolve(false);
            return;
          }

          chrome.tabs.sendMessage(
            this.chromeTabId,
            {
              action: 'PLAY_USER_ACTION',
              value: userAction
            },
            options,
            (response: any) => {
              clearTimeout(timeoutId);
              if (chrome.runtime.lastError) {
                console.warn('Erreur envoi message:', chrome.runtime.lastError.message);
                resolve(false);
              } else {
                resolve(response !== false);
              }
            }
          );
        });
      }
    });
  }

  compareImage(action: Action): Promise<boolean> {
    return new Promise((resolve) => {
      // Attendre que le rendu soit complet avant de capturer
      setTimeout(() => {
        chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: "png" }, imgData => {
          if (chrome.runtime.lastError || !imgData) {
            console.warn('Erreur capture screenshot:', chrome.runtime.lastError?.message);
            resolve(false);
            return;
          }

          try {
            const pngImgData = PNG.sync.read(Buffer.from(action.data.slice('data:image/png;base64,'.length), 'base64'));
            const pngImgData1 = PNG.sync.read(Buffer.from(imgData.slice('data:image/png;base64,'.length), 'base64'));

            // Vérifier si les dimensions sont compatibles
            const width = Math.min(pngImgData.width, pngImgData1.width);
            const height = Math.min(pngImgData.height, pngImgData1.height);

            const diffImage = new PNG({ width, height });

            // pixelmatch returns the number of mismatched pixels
            const mismatchedPixels = pixelmatch(
              pngImgData.data,
              pngImgData1.data,
              diffImage.data,
              width,
              height,
              { threshold: 0.1 } // Tolérance pour les différences mineures
            );

            const match = 1 - mismatchedPixels / (width * height);
            const misMatchPercentage = (100 - (match * 100)).toFixed(2);

            diffImage.pack();
            const chunks: Buffer[] = [];
            diffImage.on('data', (chunk: Buffer) => {
              chunks.push(chunk);
            });
            diffImage.on('end', () => {
              const result = Buffer.concat(chunks);
              const data = {
                misMatchPercentage,
                imageDataUrl: 'data:image/png;base64,' + result.toString('base64')
              };

              this.comparisonResults.push(new ComparisonResult(action.id, action.data, imgData, data));
              resolve(true);
            });
            diffImage.on('error', (err: Error) => {
              console.warn('Erreur génération diff image:', err);
              resolve(false);
            });
          } catch (err) {
            console.warn('Erreur comparaison images:', err);
            resolve(false);
          }
        });
      }, SCREENSHOT_RENDER_DELAY_MS);
    });
  }
}
