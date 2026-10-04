/**
 * Traduit une position (coordonnées de page) exprimée dans le document d'une iframe en
 * la position équivalente dans le document de la fenêtre top-level.
 *
 * Nécessaire pour replacer un repère de clic sur une capture d'écran plein-onglet
 * (chrome.tabs.captureVisibleTab) : cette capture ne connaît que la géométrie de la page
 * top-level, alors que `e.pageX`/`e.pageY` d'un clic dans une iframe sont relatifs au
 * document de CETTE iframe (ils ignorent son propre décalage dans la page hôte — header,
 * menu latéral...), d'où un repère dessiné en haut à gauche de la position réelle.
 *
 * Fonctionne quelle que soit l'origine de l'iframe (cross-origin inclus) : on ne lit jamais
 * le contenu de l'iframe, seulement la position de la balise <iframe> elle-même (toujours
 * accessible depuis son document parent, same-origin ou pas), remontée de proche en proche
 * jusqu'au sommet via postMessage.
 */

const REQUEST_TYPE = 'TUELLO_FRAME_OFFSET_REQUEST';
const RESPONSE_TYPE = 'TUELLO_FRAME_OFFSET_RESPONSE';

/** Requêtes (miennes ou relayées) en attente d'une réponse venue de mon propre parent,
 * indexées par requestId : la fenêtre à qui relayer cette réponse une fois reçue. */
const pendingForwards = new Map<string, Window>();
/** Requêtes que j'ai moi-même émises (je suis l'origine), indexées par requestId. */
const pendingOrigins = new Map<string, (coords: { x: number; y: number }) => void>();

let listenerAdded = false;

function handleMessage(event: MessageEvent): void {
  const data = event.data;
  if (!data || typeof data !== 'object' || typeof data.requestId !== 'string') {
    return;
  }

  if (data.type === REQUEST_TYPE) {
    // event.source est typé MessageEventSource (Window | MessagePort | ServiceWorker) côté
    // TypeScript, mais pour un message posté par une iframe via window.parent.postMessage,
    // c'est toujours la Window de cette iframe.
    const source = event.source as unknown as Window | null;

    // Identifie, parmi mes <iframe>, celle qui porte la fenêtre à l'origine de la demande
    // (mon enfant direct, que la demande vienne de lui ou qu'il l'ait relayée pour un
    // descendant plus profond). getBoundingClientRect() donne la position de la BOÎTE de
    // l'iframe dans MON viewport — elle ne bouge pas quand on défile à l'intérieur de
    // l'iframe, seul son CONTENU défile. `data.x`/`data.y` reçus sont donc déjà des
    // coordonnées relatives au viewport de l'émetteur (voir plus bas pourquoi), pas à son
    // document entier : les additionner telles quelles à la position de la boîte donne la
    // position exacte, sans compter deux fois le défilement interne de l'émetteur.
    let rect: DOMRect | null = null;
    for (const el of Array.from(document.querySelectorAll('iframe'))) {
      if (el.contentWindow === source) {
        rect = el.getBoundingClientRect();
        break;
      }
    }
    const boxLeft = rect?.left ?? 0;
    const boxTop = rect?.top ?? 0;

    if (window.self === window.top) {
      // Sommet atteint : conversion finale en coordonnées de PAGE (on ajoute mon propre
      // scroll ici, puisque plus personne ne continuera à remonter après moi) et réponse
      // directe à qui m'a sollicité.
      const x = boxLeft + window.scrollX + data.x;
      const y = boxTop + window.scrollY + data.y;
      source?.postMessage({ type: RESPONSE_TYPE, requestId: data.requestId, x, y }, '*');
    } else if (source) {
      // Étape intermédiaire : je dois continuer à remonter, donc je reconvertis le résultat
      // en coordonnées relatives à MON PROPRE viewport (pas de page) avant de le transmettre
      // à mon parent — mon propre scroll s'annule ici (ajouté puis aussitôt retranché), d'où
      // son absence du calcul : seule la position de la boîte de l'iframe compte à ce stade.
      pendingForwards.set(data.requestId, source);
      const x = boxLeft + data.x;
      const y = boxTop + data.y;
      window.parent.postMessage({ type: REQUEST_TYPE, requestId: data.requestId, x, y }, '*');
    }
    return;
  }

  if (data.type === RESPONSE_TYPE) {
    const resolve = pendingOrigins.get(data.requestId);
    if (resolve) {
      pendingOrigins.delete(data.requestId);
      resolve({ x: data.x, y: data.y });
      return;
    }
    const forwardTo = pendingForwards.get(data.requestId);
    if (forwardTo) {
      pendingForwards.delete(data.requestId);
      forwardTo.postMessage({ type: RESPONSE_TYPE, requestId: data.requestId, x: data.x, y: data.y }, '*');
    }
  }
}

/** À appeler dans chaque frame (top et iframes) pendant l'enregistrement : un ancêtre doit
 * pouvoir répondre même s'il n'est pas lui-même la cible du clic. */
export function addFrameOffsetListener(): void {
  if (listenerAdded) return;
  listenerAdded = true;
  window.addEventListener('message', handleMessage);
}

export function removeFrameOffsetListener(): void {
  if (!listenerAdded) return;
  listenerAdded = false;
  window.removeEventListener('message', handleMessage);
  pendingForwards.clear();
  pendingOrigins.clear();
}

/** Au-delà de ce délai on abandonne la résolution (ancêtre détruit, navigation en cours...) :
 * mieux vaut un repère non corrigé qu'un clic retardé indéfiniment. */
const RESOLVE_TIMEOUT_MS = 300;

/**
 * Résout x,y (coordonnées de page LOCALES à ce frame, ex. e.pageX/e.pageY) en coordonnées de
 * page du frame top-level. Résolution immédiate si on est déjà le frame top-level.
 */
export function resolveTopPageCoordinates(x: number, y: number): Promise<{ x: number; y: number }> {
  if (window.self === window.top) {
    return Promise.resolve({ x, y });
  }

  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = setTimeout(() => {
      pendingOrigins.delete(requestId);
      resolve({ x, y });
    }, RESOLVE_TIMEOUT_MS);

    pendingOrigins.set(requestId, (coords) => {
      clearTimeout(timeout);
      resolve(coords);
    });

    // On transmet des coordonnées relatives à MON PROPRE viewport, pas à mon document entier :
    // x,y (type pageX/pageY) incluent mon propre défilement interne, qui n'a aucun sens pour
    // mon parent (la position de ma boîte <iframe> chez lui ne bouge pas quand JE défile).
    // Voir le symétrique côté handleMessage (étape intermédiaire).
    window.parent.postMessage({ type: REQUEST_TYPE, requestId, x: x - window.scrollX, y: y - window.scrollY }, '*');
  });
}
