/**
 * Redimensionnement de fenêtre au rejeu d'un enregistrement.
 *
 * Un enregistrement mémorise la position (top/left) de la fenêtre d'origine,
 * exprimée dans le bureau virtuel de la machine qui a enregistré. Réappliquer
 * ces coordonnées telles quelles sur une autre machine (ou une autre
 * disposition d'écrans) envoie la fenêtre sur un autre écran.
 *
 * On n'applique donc que la taille enregistrée, et on recadre la fenêtre pour
 * qu'elle reste entièrement visible sur l'écran où elle se trouve actuellement.
 */

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Surface de recouvrement entre deux rectangles */
function intersectionArea(a: Bounds, b: Bounds): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/** Ramène `value` dans [min, max] ; si l'intervalle est vide, on se cale sur `min` */
function clamp(value: number, min: number, max: number): number {
  return max < min ? min : Math.min(Math.max(value, min), max);
}

/** Zones de travail des écrans (hors barre des tâches / dock), ou [] si indisponible */
function getWorkAreas(): Promise<Bounds[]> {
  return new Promise((resolve) => {
    if (!chrome.system?.display?.getInfo) {
      resolve([]);
      return;
    }
    chrome.system.display.getInfo((displays) => {
      if (chrome.runtime.lastError || !displays) {
        resolve([]);
        return;
      }
      resolve(displays.map((display) => display.workArea));
    });
  });
}

/**
 * Calcule les paramètres de `chrome.windows.update` pour donner à la fenêtre la
 * taille demandée sans la faire changer d'écran.
 */
export async function buildResizeOnCurrentScreen(win: chrome.windows.Window, requestedWidth?: number, requestedHeight?: number): Promise<chrome.windows.UpdateInfo> {
  const width = requestedWidth ?? win.width;
  const height = requestedHeight ?? win.height;
  const updateInfo: chrome.windows.UpdateInfo = { state: 'normal', width, height };

  // Une fenêtre maximisée/plein écran rapporte ses dimensions d'état, pas celles
  // qu'elle aura en 'normal' : sa position reste un bon repère pour l'écran.
  if (width === undefined || height === undefined || win.left === undefined || win.top === undefined || win.width === undefined || win.height === undefined) {
    return updateInfo;
  }
  const current: Bounds = { left: win.left, top: win.top, width: win.width, height: win.height };

  const workAreas = await getWorkAreas();
  if (workAreas.length === 0) {
    // Sans information d'écran, on garde au moins la position actuelle
    updateInfo.left = current.left;
    updateInfo.top = current.top;
    return updateInfo;
  }

  // Écran courant : celui qui contient la plus grande partie de la fenêtre
  let screen = workAreas[0];
  let bestArea = -1;
  for (const area of workAreas) {
    const overlap = intersectionArea(current, area);
    if (overlap > bestArea) {
      bestArea = overlap;
      screen = area;
    }
  }

  updateInfo.left = Math.round(clamp(current.left, screen.left, screen.left + screen.width - width));
  updateInfo.top = Math.round(clamp(current.top, screen.top, screen.top + screen.height - height));
  return updateInfo;
}
