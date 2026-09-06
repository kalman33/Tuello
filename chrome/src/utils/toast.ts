/**
 * Message de confirmation discret, affiché par-dessus la page.
 *
 * Contrairement à la lightbox, il ne pose pas de voile plein écran : l'utilisateur
 * peut enchaîner les clics (les chiffres d'un code PIN) sans attendre sa fermeture.
 */

const TOAST_ID = 'tuello-toast';
const DEFAULT_DURATION_MS = 1200;

let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

function getContainer(): HTMLElement | null {
  if (!document.body) {
    return null;
  }

  let container = document.getElementById(TOAST_ID);
  if (container) {
    return container;
  }

  container = document.createElement('div');
  container.id = TOAST_ID;
  const style = container.style;
  style.setProperty('position', 'fixed', 'important');
  style.setProperty('bottom', '24px', 'important');
  style.setProperty('left', '50%', 'important');
  style.setProperty('transform', 'translateX(-50%)', 'important');
  style.setProperty('z-index', '2147483647', 'important');
  style.setProperty('padding', '8px 16px', 'important');
  style.setProperty('border-radius', '4px', 'important');
  style.setProperty('background-color', 'rgba(0, 0, 0, 0.8)', 'important');
  style.setProperty('color', 'white', 'important');
  style.setProperty('font-family', 'system-ui, sans-serif', 'important');
  style.setProperty('font-size', '14px', 'important');
  style.setProperty('max-width', '80%', 'important');
  // Le toast ne doit jamais intercepter un clic destiné à la page
  style.setProperty('pointer-events', 'none', 'important');
  document.body.appendChild(container);
  return container;
}

export function showToast(message: string, durationMs: number = DEFAULT_DURATION_MS): void {
  const container = getContainer();
  if (!container) {
    return;
  }

  container.textContent = message;
  container.style.setProperty('display', 'block', 'important');

  if (hideTimeoutId) {
    clearTimeout(hideTimeoutId);
  }
  hideTimeoutId = setTimeout(() => {
    container.style.setProperty('display', 'none', 'important');
    hideTimeoutId = null;
  }, durationMs);
}
