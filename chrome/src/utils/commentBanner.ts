/**
 * Bandeau affichant, pendant le rejeu, le commentaire saisi lors de l'enregistrement.
 *
 * Contrairement au toast, il reste lisible sur plusieurs lignes (un commentaire
 * décrit une étape du scénario) et se masque à la demande : le player le retire
 * avant une capture d'écran pour ne pas fausser la comparaison d'images.
 */

const BANNER_ID = 'tuello-comment-banner';
const DEFAULT_DURATION_MS = 3000;

let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

function getContainer(): HTMLElement | null {
  if (!document.body) {
    return null;
  }

  let container = document.getElementById(BANNER_ID);
  if (container) {
    return container;
  }

  container = document.createElement('div');
  container.id = BANNER_ID;
  const style = container.style;
  style.setProperty('position', 'fixed', 'important');
  style.setProperty('top', '16px', 'important');
  style.setProperty('left', '50%', 'important');
  style.setProperty('transform', 'translateX(-50%)', 'important');
  style.setProperty('z-index', '2147483647', 'important');
  style.setProperty('padding', '12px 20px', 'important');
  style.setProperty('border-radius', '6px', 'important');
  style.setProperty('border-left', '5px solid #D12566', 'important');
  style.setProperty('background-color', 'rgba(0, 0, 0, 0.85)', 'important');
  style.setProperty('box-shadow', '0 2px 12px rgba(0, 0, 0, 0.4)', 'important');
  style.setProperty('color', 'white', 'important');
  style.setProperty('font-family', 'system-ui, sans-serif', 'important');
  style.setProperty('font-size', '15px', 'important');
  style.setProperty('line-height', '1.4', 'important');
  style.setProperty('text-align', 'left', 'important');
  style.setProperty('white-space', 'pre-wrap', 'important');
  style.setProperty('max-width', '70%', 'important');
  // Le bandeau ne doit jamais intercepter un clic rejoué sur la page
  style.setProperty('pointer-events', 'none', 'important');
  document.body.appendChild(container);
  return container;
}

/**
 * Affiche le commentaire pendant `durationMs`.
 */
export function showComment(comment: string, durationMs: number = DEFAULT_DURATION_MS): void {
  const container = getContainer();
  if (!container) {
    return;
  }

  container.textContent = `💬 ${comment}`;
  container.style.setProperty('display', 'block', 'important');

  if (hideTimeoutId) {
    clearTimeout(hideTimeoutId);
  }
  hideTimeoutId = setTimeout(() => {
    hideComment();
  }, durationMs);
}

/**
 * Masque le bandeau immédiatement (fin de rejeu, capture d'écran à venir).
 */
export function hideComment(): void {
  if (hideTimeoutId) {
    clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  }
  const container = document.getElementById(BANNER_ID);
  if (container) {
    container.style.setProperty('display', 'none', 'important');
  }
}
