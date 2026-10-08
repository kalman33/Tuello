import { IFRAME_WIDTH_PX } from '../utils/constants';

/**
 * Hôte de l'app dans le panneau latéral de Chrome. L'app est conçue pour la largeur
 * de l'iframe injectée dans les pages ; le panneau latéral est souvent plus étroit.
 * L'app tourne donc dans une iframe à sa largeur de conception, réduite visuellement :
 * son viewport reste celui attendu (les hauteurs en vh restent justes), contrairement
 * à un zoom CSS appliqué directement à l'app.
 */
const iframe = document.getElementById('tuelloSidePanel') as HTMLIFrameElement;

function fit(): void {
  const scale = Math.min(1, window.innerWidth / IFRAME_WIDTH_PX);
  // Panneau plus large que la conception : l'app occupe toute la largeur sans réduction
  iframe.style.width = `${Math.max(IFRAME_WIDTH_PX, window.innerWidth)}px`;
  iframe.style.height = `${window.innerHeight / scale}px`;
  iframe.style.transform = `scale(${scale})`;
}

// Le paramètre sidepanel (onglet piloté) est transmis tel quel à l'app
iframe.src = chrome.runtime.getURL(`index.html${window.location.search}`);
fit();
window.addEventListener('resize', fit);
