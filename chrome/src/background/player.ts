import { Action } from '../../../src/app/spy-http/models/Action';
import { ActionType } from '../../../src/app/spy-http/models/ActionType';
import { ComparisonResult } from '../models/ComparisonResult';
import { IFrame } from '../models/IFrame';
import { getFrameIdFromSrc } from './uiRecorderHandler';
import { UserAction } from '../models/UserAction';
import { comparePngDataUrls } from '../utils/imageCompare';

/** Timeout par défaut pour les actions en ms */
const ACTION_TIMEOUT_MS = 30000;

/** Délai d'attente avant capture screenshot pour s'assurer du rendu complet */
const SCREENSHOT_RENDER_DELAY_MS = 300;

/** Dimensions minimales et maximales pour la fenêtre */
const MIN_WINDOW_SIZE = 100;
const MAX_WINDOW_SIZE = 10000;

/** Bornes d'affichage du commentaire pendant le rejeu (ms) */
const MIN_COMMENT_DISPLAY_MS = 2000;
const MAX_COMMENT_DISPLAY_MS = 10000;

/**
 * Rejeu accéléré : délai minimum avant une action. La cible peut être affichée avant
 * que l'application n'y ait branché ses gestionnaires (fin de rendu, animation).
 */
const FAST_REPLAY_MIN_DELAY_MS = 250;

/**
 * Actions après lesquelles une navigation complète peut suivre. Le player se met en
 * pause sur onBeforeNavigate : si celle-ci démarre après coup (submit lent), une action
 * accélérée serait déjà partie dans l'ancienne page et perdue à son déchargement.
 */
const MAY_NAVIGATE_TYPES = ['enterKey', 'recordByImg', 'reload'];

/** Types d'`<input>` dont le clic peut soumettre un formulaire */
const SUBMITTING_INPUT_TYPES = ['submit', 'image', 'button', 'reset'];

/**
 * L'action peut-elle attendre sa cible côté page ? Il faut de quoi la reconnaître :
 * - clic : une description qui désigne l'élément (testId, rôle, libellé ou texte ; mêmes
 *   critères que matchesTarget, non importé ici car module DOM, côté page) ;
 * - saisie, Entrée : le sélecteur CSS du champ ;
 * - Maj+clic : le libellé ; image : l'image enregistrée.
 * Les iframes ne sont pas encore gérées.
 */
function isAccelerable(action: Action): boolean {
  const userAction = action.userAction;
  if (!userAction || (userAction.frame?.frameId ?? 0) !== 0) {
    return false;
  }
  switch (action.actionType) {
    case ActionType.EVENT:
      if (userAction.type === 'click') {
        const target = userAction.target;
        return !!(target?.testId || target?.label || target?.placeholder || target?.role || target?.text);
      }
      return (userAction.type === 'input' || userAction.type === 'enterKey') && !!userAction.selector;
    case ActionType.RECORD_BY_LABEL:
      return !!userAction.label;
    case ActionType.RECORD_BY_IMAGE:
      return !!userAction.value;
    default:
      return false;
  }
}

/** Un clic sur un champ de saisie sert à le focaliser : il ne déclenche pas de navigation */
function isFieldClick(previous: Action): boolean {
  const target = previous.userAction?.type === 'click' ? previous.userAction.target : undefined;
  if (!target) {
    return false;
  }
  return target.tag === 'textarea' || target.tag === 'select' || (target.tag === 'input' && !SUBMITTING_INPUT_TYPES.includes(target.inputType));
}

/** L'action précédente a-t-elle pu déclencher une navigation complète ? Dans le doute, oui. */
function mayNavigate(previous: Action, next: Action): boolean {
  if (previous.actionType === ActionType.NAVIGATE || MAY_NAVIGATE_TYPES.includes(previous.userAction?.type)) {
    return true;
  }
  const previousHref = previous.userAction?.hrefLocation;
  if (!previousHref) {
    return false;
  }
  // Un changement d'URL entre les deux actions signale une navigation (ou un changement
  // de route d'une SPA, écarté aussi par prudence)
  const nextHref = next.userAction?.hrefLocation;
  if (nextHref) {
    return nextHref !== previousHref;
  }
  // L'action suivante ne porte pas d'URL (saisie, Entrée, image) : seul un clic sur un
  // champ garantit que la page n'a pas changé entre les deux
  return !isFieldClick(previous);
}

/**
 * Une action peut être accélérée si la page sait reconnaître sa cible et que l'action
 * précédente ne peut pas déclencher de navigation. Sinon, le délai enregistré est
 * conservé tel quel.
 */
function canFastReplay(previous: Action | undefined, next: Action | undefined, delay: number): boolean {
  if (!previous || !next || delay <= FAST_REPLAY_MIN_DELAY_MS) {
    return false;
  }
  return isAccelerable(next) && !mayNavigate(previous, next);
}

/** Options de rejeu */
export interface PlayerOptions {
  /**
   * Rejeu silencieux (scénario lancé depuis la mosaïque) : à la fin comme en cas
   * d'échec d'une action, le panneau Tuello ne doit pas s'ouvrir — l'utilisateur a
   * juste demandé l'ouverture d'un site. Le nettoyage passe par ce callback, à la
   * place du message ACTIONS_RESULTS qui rouvre le panneau et l'écran de comparaison.
   */
  onFinished?: () => void;
}

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
  comparisonResults: ComparisonResult[] = [];
  actionResults: ActionResult[] = [];
  private isDestroyed = false;
  private onFinished?: () => void;
  /** Réglage « Rejeu accéléré », lu à la création du player */
  private fastReplay = false;
  /** Attente maximale de la cible transmise avec la prochaine action, quand elle est accélérée */
  private nextMaxWaitMs: number | undefined;
  /** Rejeu sans retour visuel de Tuello (scénario lancé depuis la mosaïque) */
  readonly silent: boolean;

  constructor(actions: Action[], chromeTabId: number, senderResponse: (response?: any) => void, options?: PlayerOptions) {
    this.initialActions = actions;
    this.chromeTabId = chromeTabId;
    this.yieldActions = this.iterateGenerator(actions);
    this.onFinished = options?.onFinished;
    this.silent = !!options?.onFinished;
    // Lecture asynchrone sans risque : la première action garde toujours son délai
    // enregistré (startTimeout), le réglage n'est consulté qu'à partir de la deuxième.
    chrome.storage.local.get(['fastReplay'], (results) => {
      this.fastReplay = !chrome.runtime.lastError && !!results?.fastReplay;
    });
  }

  /** Termine un rejeu silencieux (fin normale ou action en échec) */
  finishSilently(): void {
    this.destroy();
    this.onFinished?.();
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

    // Reprise (lancement, fin de navigation, PLAY après PAUSE) : toujours le délai enregistré
    this.nextMaxWaitMs = undefined;
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
    const maxWaitMs = this.nextMaxWaitMs;
    this.nextMaxWaitMs = undefined;

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
      } else if (action.value.actionType === 'COMMENT') {
        actionSuccess = await this.showComment(action.value);
      } else if (action.value.actionType === 'TEST_START') {
        // Simple repère pour l'export Playwright : rien à rejouer. Sans ce cas, il partait
        // dans handleUserAction sans userAction et le rejeu échouait sur cette étape.
        actionSuccess = true;
      } else {
        actionSuccess = await this.handleUserAction(userAction, maxWaitMs);
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
    const failedActions = this.actionResults.filter((r) => !r.success);
    if (failedActions.length > 0) {
      console.warn(`${failedActions.length} action(s) ont échoué:`, failedActions);
    }

    // Rejeu silencieux : on ne réveille pas le panneau Tuello dans la page
    if (this.onFinished) {
      this.onFinished();
      return;
    }

    chrome.tabs.sendMessage(
      this.chromeTabId,
      {
        action: 'ACTIONS_RESULTS',
        value: {
          comparisonResults: this.comparisonResults,
          actionResults: this.actionResults
        }
      },
      {
        frameId: 0
      },
      () => {
        if (chrome.runtime.lastError) {
          // Ignorer - l'onglet peut être fermé
        }
      }
    );
  }

  /**
   * Affiche dans la page le commentaire saisi pendant l'enregistrement.
   *
   * Le bandeau reste visible jusqu'à l'action suivante (borné) : sans cela, un
   * commentaire suivi d'un long délai disparaissait avant que l'utilisateur ait
   * pu le lire, et un commentaire suivi d'une action immédiate le laissait à
   * l'écran pendant la suite du scénario.
   */
  private async showComment(action: Action): Promise<boolean> {
    // Rejeu silencieux : aucun retour visuel de Tuello dans la page
    if (this.silent || !action.data) {
      return true;
    }

    const nextDelay = this.initialActions[this.count]?.delay ?? 0;
    const durationMs = Math.min(Math.max(nextDelay, MIN_COMMENT_DISPLAY_MS), MAX_COMMENT_DISPLAY_MS);

    return this.sendToContent({
      action: 'SHOW_REPLAY_COMMENT',
      value: action.data,
      durationMs
    });
  }

  /** Retire le bandeau de commentaire (avant une capture d'écran) */
  private async hideComment(): Promise<boolean> {
    if (this.silent) {
      return true;
    }
    return this.sendToContent({ action: 'HIDE_REPLAY_COMMENT' });
  }

  /** Envoie un message au document principal de l'onglet rejoué */
  private sendToContent(message: Record<string, any>): Promise<boolean> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(this.chromeTabId, message, { frameId: 0 }, () => {
        // Un content script absent (page interne, onglet fermé) ne doit pas
        // interrompre le rejeu
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  private async handleNavigate(userAction: UserAction): Promise<boolean> {
    // Un rechargement enregistré (F5) est rejoué comme tel : redemander l'URL
    // courante ne recharge pas forcément la page.
    if (userAction.type === 'reload') {
      return new Promise((resolve) => {
        chrome.tabs.reload(this.chromeTabId, {}, () => {
          if (chrome.runtime.lastError) {
            console.warn('Erreur rechargement:', chrome.runtime.lastError.message);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    }

    // On navigue dans l'onglet rejoué : avec l'onglet actif, un scénario lancé
    // depuis la mosaïque pouvait détourner un autre onglet.
    return new Promise((resolve) => {
      chrome.tabs.update(this.chromeTabId, { url: userAction.hrefLocation }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Erreur navigation:', chrome.runtime.lastError.message);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  private async handleUserAction(userAction: UserAction, maxWaitMs?: number): Promise<boolean> {
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

    const played = await this.sendMessageToContent(userAction, options, maxWaitMs);
    if (played) {
      return true;
    }
    return this.retryOnOtherFrames(userAction, options.frameId);
  }

  /**
   * Rejoue l'action dans les autres frames de l'onglet.
   *
   * L'iframe cible est retrouvée par son URL, qui peut avoir changé depuis
   * l'enregistrement (redirection d'authentification, paramètre de session) :
   * l'action partait alors dans le document principal, où le champ n'existe pas.
   * Limité aux actions capables de dire elles-mêmes qu'elles ont trouvé leur
   * cible ; un clic par coordonnées, lui, réussit toujours et serait rejoué en
   * double.
   */
  private async retryOnOtherFrames(userAction: UserAction, triedFrameId: number): Promise<boolean> {
    if (userAction.type !== 'input' || !userAction.selector) {
      return false;
    }

    const frames = await new Promise<chrome.webNavigation.GetAllFrameResultDetails[]>((resolve) => {
      chrome.webNavigation.getAllFrames({ tabId: this.chromeTabId }, (result) => {
        resolve(chrome.runtime.lastError || !result ? [] : result);
      });
    });

    for (const frame of frames) {
      if (frame.frameId === triedFrameId) {
        continue;
      }
      if (await this.sendMessageToContent(userAction, { frameId: frame.frameId })) {
        return true;
      }
    }
    return false;
  }

  private scheduleNextAction(): void {
    if (this.isDestroyed) return;

    const nextAction = this.initialActions[this.count];
    const currentAction = this.initialActions[this.count - 1];
    const delay = nextAction?.delay ?? currentAction?.delay ?? 0;

    // Rejeu accéléré : le clic part après le délai minimum et la page attend sa cible
    // pendant le reste du délai enregistré, qui devient un plafond.
    if (this.fastReplay && canFastReplay(currentAction, nextAction, delay)) {
      this.nextMaxWaitMs = delay - FAST_REPLAY_MIN_DELAY_MS;
      this.timeoutId = setTimeout(() => this.treatAction(), FAST_REPLAY_MIN_DELAY_MS);
      return;
    }

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
        // count et comparisonResults font partie de l'état du rejeu : sans reset,
        // les délais repartaient au mauvais index et les comparaisons s'empilaient
        // d'un rejeu à l'autre.
        this.count = 0;
        this.comparisonResults = [];
        this.nextMaxWaitMs = undefined;
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

  sendMessageToContent(userAction: UserAction, options?: chrome.tabs.MessageSendOptions, maxWaitMs?: number): Promise<boolean> {
    return new Promise((resolve) => {
      // Créer un timeout pour éviter de bloquer indéfiniment. L'attente de la cible
      // (rejeu accéléré) s'y ajoute : un délai enregistré long ferait sinon échouer l'action.
      const timeoutId = setTimeout(
        () => {
          console.warn(`Timeout atteint pour l'action: ${userAction.type}`);
          resolve(false);
        },
        ACTION_TIMEOUT_MS + (maxWaitMs ?? 0)
      );

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
            state: 'normal'
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
              value: userAction,
              maxWaitMs
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
    // Le bandeau de commentaire fausserait la comparaison avec la référence
    const bannerHidden = this.hideComment();

    return new Promise((resolve) => {
      // Attendre que le rendu soit complet avant de capturer
      setTimeout(async () => {
        await bannerHidden;
        chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: 'png' }, (imgData) => {
          if (chrome.runtime.lastError || !imgData) {
            console.warn('Erreur capture screenshot:', chrome.runtime.lastError?.message);
            resolve(false);
            return;
          }

          try {
            // Le candidat est ramené aux dimensions de la référence si besoin : la
            // fenêtre de rejeu n'a pas toujours exactement la taille d'enregistrement
            // (devtools ouverts, zoom, autre écran) et la comparaison échouait alors
            // silencieusement.
            const comparison = comparePngDataUrls(action.data, imgData, { threshold: 0.1, withDiff: true });

            if (comparison.rescaled) {
              console.warn("Tuello: la capture n'a pas la taille de l'enregistrement, elle a été redimensionnée avant comparaison.");
            }

            const data = {
              misMatchPercentage: comparison.differencePercent.toFixed(2),
              imageDataUrl: comparison.diffDataUrl
            };

            this.comparisonResults.push(new ComparisonResult(action.id, action.data, imgData, data));
            resolve(true);
          } catch (err) {
            console.warn('Erreur comparaison images:', err);
            resolve(false);
          }
        });
      }, SCREENSHOT_RENDER_DELAY_MS);
    });
  }
}
