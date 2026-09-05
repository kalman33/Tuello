/**
 * Détection de la plateforme et formatage des libellés de touches.
 *
 * Les raccourcis de Tuello reposent sur `altKey` + `shiftKey`, mais ces touches
 * ne portent pas le même nom selon l'OS : sur macOS il s'agit de ⌥ (Option) et
 * de ⇧ (Maj), alors que sur Windows / Linux on parle de "Alt" et "Maj/Shift".
 * Ce module centralise la détection pour que l'UI Angular, les menus contextuels
 * et les content scripts affichent tous la même chose.
 */

export type TuelloPlatform = 'mac' | 'other';

/** Libellés des touches de modification affichés à l'utilisateur */
export interface ModifierLabels {
  alt: string;
  shift: string;
}

/** Libellés macOS : les symboles sont la convention Apple, aucun besoin de traduction */
export const MAC_MODIFIER_LABELS: ModifierLabels = { alt: '⌥', shift: '⇧' };

/** Libellés par défaut (Windows / Linux) si aucune traduction n'est fournie */
export const DEFAULT_MODIFIER_LABELS: ModifierLabels = { alt: 'Alt', shift: 'Maj' };

/** Noms complets, utilisés en infobulle pour lever toute ambiguïté */
export const MAC_MODIFIER_TITLES: ModifierLabels = { alt: 'Option', shift: 'Maj' };

let cachedPlatform: TuelloPlatform | undefined;

/**
 * Détection synchrone à partir de `navigator`. Disponible aussi bien dans la page
 * d'extension Angular que dans le service worker (WorkerNavigator) et les content scripts.
 */
export function getPlatform(): TuelloPlatform {
  if (cachedPlatform) {
    return cachedPlatform;
  }

  let isMac = false;
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
    const uaDataPlatform: string | undefined = nav?.userAgentData?.platform;
    const legacyPlatform: string | undefined = nav?.platform;
    const userAgent: string | undefined = nav?.userAgent;

    isMac = /mac/i.test(uaDataPlatform || legacyPlatform || '') || (!uaDataPlatform && !legacyPlatform && /mac/i.test(userAgent || ''));
  } catch {
    isMac = false;
  }

  cachedPlatform = isMac ? 'mac' : 'other';
  return cachedPlatform;
}

export function isMacPlatform(): boolean {
  return getPlatform() === 'mac';
}

/**
 * Détection asynchrone via l'API extension, plus fiable que `navigator` dans le
 * service worker. Retombe sur `getPlatform()` si l'API n'est pas disponible.
 */
export async function resolvePlatform(): Promise<TuelloPlatform> {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getPlatformInfo) {
      const info = await chrome.runtime.getPlatformInfo();
      cachedPlatform = info?.os === 'mac' ? 'mac' : 'other';
      return cachedPlatform;
    }
  } catch {
    // on retombe sur la détection navigator
  }
  return getPlatform();
}

/**
 * Retourne les libellés à afficher pour Alt et Maj.
 * @param translated libellés traduits à utiliser hors macOS (ex: "Alt" / "Shift")
 */
export function getModifierLabels(translated?: Partial<ModifierLabels>, platform: TuelloPlatform = getPlatform()): ModifierLabels {
  if (platform === 'mac') {
    return MAC_MODIFIER_LABELS;
  }
  return {
    alt: translated?.alt || DEFAULT_MODIFIER_LABELS.alt,
    shift: translated?.shift || DEFAULT_MODIFIER_LABELS.shift
  };
}

/**
 * Construit un libellé de raccourci du type "⌥ + ⇧ + S".
 * Les jetons `alt` et `shift` sont remplacés par le libellé de la plateforme,
 * tout autre élément est repris tel quel.
 */
export function formatShortcut(keys: string[], translated?: Partial<ModifierLabels>, platform: TuelloPlatform = getPlatform()): string {
  const labels = getModifierLabels(translated, platform);
  return keys
    .map((key) => {
      if (key === 'alt') {
        return labels.alt;
      }
      if (key === 'shift') {
        return labels.shift;
      }
      return key;
    })
    .join(' + ');
}
