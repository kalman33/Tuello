import { Track } from '../models/Track';
import { TrackType } from '../models/TrackType';
import { ICoordinates } from '../models/UserAction';
import JsonFind from 'json-find';
import { getElementFromXPath, getXPath, isFixedPosition } from './utils';
import { decompress, loadCompressed } from './compression';
import { DEBOUNCE_DELAY_MS } from './constants';

/** Dernier clic sur un contrôle de la page : origine des tracks CLICK */
interface LastClick {
  /** Instant du clic, sur la même horloge que les PerformanceResourceTiming */
  time: number;
  x: number;
  y: number;
  hrefLocation: string;
  element: string;
  parentPosition: string;
  htmlCoordinates: ICoordinates;
}

interface TrackSettings {
  tuelloTrackData?: string;
  tuelloTrackDataDisplay?: string;
  tuelloTrackDataDisplayType?: string;
}

const TRACK_ID_PREFIX = 'tuelloTrack';
const TRACK_SETTINGS_KEYS: (keyof TrackSettings)[] = ['tuelloTrackData', 'tuelloTrackDataDisplay', 'tuelloTrackDataDisplayType'];
/** Contrôles dont le clic peut déclencher une requête */
/**
 * Délai maximal entre un clic et le départ d'une requête pour la lui attribuer :
 * au-delà, un polling ou un lazy-loading survenu bien plus tard était rattaché au clic.
 */
const CLICK_ATTRIBUTION_WINDOW_MS = 5000;
/** Position de la première pastille PAGE et écart vertical entre deux pastilles */
const PAGE_BUBBLE_TOP = 50;
const PAGE_BUBBLE_SPACING = 36;
const CLICKABLE_SELECTOR = 'a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"], input[type="button"], input[type="submit"]';

let active = false;
// Incrémenté à chaque activation/désactivation : une activation dont le
// chargement se termine après une désactivation ne doit rien installer.
let activationGeneration = 0;
let lastClick: LastClick;
let performanceObserver: PerformanceObserver;
let bodyObserver: MutationObserver;
let resizeObserver: ResizeObserver;
let timer;
let forceRebuild = false;

// Copies mémoire tenues à jour par chrome.storage.onChanged : évite de relire et
// décompresser le stockage à chaque mutation du DOM ou ressource chargée.
let tuelloTracks: Track[] = [];
let settings: TrackSettings = {};

// Seuls childList et subtree sont nécessaires : le rendu n'utilise que
// addedNodes/removedNodes, pas les changements d'attributs ou de texte.
const mutationOptions = {
  childList: true,
  subtree: true
};

export async function activateRecordTracks() {
  if (active) {
    scheduleRender();
    return;
  }
  active = true;
  const generation = ++activationGeneration;

  try {
    const [results, tracks] = await Promise.all([chrome.storage.local.get<TrackSettings>(TRACK_SETTINGS_KEYS), loadCompressed<Track[]>('tuelloTracks')]);
    settings = results;
    tuelloTracks = tracks || [];
  } catch {
    tuelloTracks = [];
  }
  if (generation !== activationGeneration) {
    return;
  }

  chrome.storage.onChanged.addListener(storageListener);
  // on active le listener pour le click souris
  document.addEventListener('click', clickListener);

  // on observe les événements de mesure des performances de type resource
  performanceObserver = new PerformanceObserver(recordListener);
  performanceObserver.observe({ type: 'resource', buffered: true });

  const root = document.body ?? document.documentElement;
  bodyObserver = new MutationObserver(onMutations);
  bodyObserver.observe(root, mutationOptions);
  resizeObserver = new ResizeObserver(() => scheduleRender());
  resizeObserver.observe(root);

  scheduleRender();
}

export function desactivateRecordTracks() {
  active = false;
  activationGeneration++;
  // Sans cela, un rendu programmé juste avant la désactivation réaffichait
  // les pastilles, qui restaient ensuite sans observer pour les retirer.
  clearTimeout(timer);
  timer = undefined;
  performanceObserver?.disconnect();
  performanceObserver = undefined;
  bodyObserver?.disconnect();
  bodyObserver = undefined;
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  chrome.storage.onChanged.removeListener(storageListener);
  document.removeEventListener('click', clickListener);
  lastClick = undefined;
  removeTracks();
}

function storageListener(changes: Record<string, chrome.storage.StorageChange>, areaName: string) {
  if (areaName !== 'local') {
    return;
  }
  if (changes.tuelloTracks) {
    try {
      tuelloTracks = decompress<Track[]>(changes.tuelloTracks.newValue as string) || [];
    } catch {
      tuelloTracks = [];
    }
    scheduleRender();
  }
  for (const key of TRACK_SETTINGS_KEYS) {
    if (changes[key]) {
      settings = { ...settings, [key]: changes[key].newValue };
      if (key !== 'tuelloTrackData') {
        // les titres des pastilles dépendent des réglages d'affichage
        forceRebuild = true;
        scheduleRender();
      }
    }
  }
}

function isNonTuelloNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const { id, className } = node;
  return (!id || !id.includes('tuello')) && (!className || typeof className !== 'string' || !className.includes('tuello'));
}

function hasNonTuelloNode(nodes: NodeList): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (isNonTuelloNode(nodes[i])) {
      return true;
    }
  }
  return false;
}

function onMutations(mutationsList: MutationRecord[]) {
  // removedNodes compte aussi : un contrôle retiré doit faire disparaître sa pastille
  if (mutationsList.some((mutation) => hasNonTuelloNode(mutation.addedNodes) || hasNonTuelloNode(mutation.removedNodes))) {
    scheduleRender();
  }
}

function scheduleRender() {
  // on ne réexecute le rendu que tous les DEBOUNCE_DELAY_MS
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    if (active) {
      renderTracks();
    }
  }, DEBOUNCE_DELAY_MS);
}

/**
 * Met les pastilles de la page en accord avec les tracks : seules les pastilles
 * manquantes sont créées et les obsolètes retirées, au lieu de tout recréer à
 * chaque mutation du DOM.
 */
function renderTracks() {
  if (forceRebuild) {
    forceRebuild = false;
    removeTracks();
  }
  const href = window.location.href;
  const wanted = new Set<string>();
  let pageIndex = 0;

  for (const track of tuelloTracks) {
    // on ne garde que les tracks de cette page
    if (track.hrefLocation !== href || !track.id) {
      continue;
    }
    let element: HTMLElement = null;
    if (track.type === TrackType.CLICK) {
      element = findElement(track.element);
      if (!isElementVisible(element)) {
        continue;
      }
    }
    wanted.add(track.id);

    let bubble = document.getElementById(track.id);
    // pastille accrochée à côté d'un élément que la page a remplacé : à reconstruire
    if (bubble && track.type === TrackType.CLICK && track.parentPosition === 'fixed' && bubble.previousElementSibling !== element) {
      bubble.remove();
      bubble = null;
    }
    if (!bubble) {
      bubble = displayTrack(track, element);
    }
    // Repositionnée à chaque rendu : la pastille suit l'élément quand la mise en page change
    if (track.type === TrackType.PAGE) {
      // pastilles PAGE empilées au lieu d'être superposées au même endroit
      bubble.style.top = PAGE_BUBBLE_TOP + pageIndex++ * PAGE_BUBBLE_SPACING + 'px';
    } else {
      positionClickBubble(track, bubble, element);
    }
  }

  document.querySelectorAll<HTMLElement>(`div[id^="${TRACK_ID_PREFIX}"]`).forEach((elt) => {
    if (!wanted.has(elt.id)) {
      elt.remove();
    }
  });
}

function findElement(xpath: string): HTMLElement {
  try {
    return xpath ? getElementFromXPath(xpath) : null;
  } catch {
    // XPath invalide (anciens tracks) : traité comme un élément absent
    return null;
  }
}

function isElementVisible(elt: HTMLElement): boolean {
  return !!(elt && (elt.offsetWidth || elt.offsetHeight || elt.getClientRects().length));
}

function recordListener(list: PerformanceObserverEntryList) {
  const trackData = settings.tuelloTrackData;
  // un champ vide correspondrait à toutes les ressources de la page
  if (!trackData) {
    return;
  }
  for (const entry of list.getEntries()) {
    if (!entry.name.includes(trackData)) {
      continue;
    }
    try {
      chrome.runtime.sendMessage({ action: 'APPEND_TRACK', value: buildTrack(entry) }, () => chrome.runtime.lastError);
    } catch (e) {
      // une URL invalide ne doit pas faire perdre le reste du lot
      console.warn('Tuello: ressource non traquée', entry.name, e);
    }
  }
}

function buildTrack(entry: PerformanceEntry): Track {
  const track = new Track();
  track.hrefLocation = window.location.href;

  // initiatorType: "xmlhttprequest"
  const url = new URL(entry.name);
  if (url.search) {
    const querystring = {};
    url.searchParams.forEach((value, key) => (querystring[key] = value));
    track.querystring = querystring;
    url.search = '';
  }
  track.url = url.href;

  if (isCausedByLastClick(entry, track.hrefLocation)) {
    // on est sur le meme href : c'est un track click
    track.type = TrackType.CLICK;
    track.id = TRACK_ID_PREFIX + 'Click' + uniqueId();
    track.x = lastClick.x;
    track.y = lastClick.y;
    track.element = lastClick.element;
    track.parentPosition = lastClick.parentPosition;
    track.htmlCoordinates = lastClick.htmlCoordinates;
  } else {
    // c'est un track page
    track.type = TrackType.PAGE;
    track.id = TRACK_ID_PREFIX + 'Page' + uniqueId();
    track.parentPosition = 'fixed';
  }
  return track;
}

/** La requête est partie peu après le dernier clic, sur la même page */
function isCausedByLastClick(entry: PerformanceEntry, hrefLocation: string): boolean {
  if (!lastClick || lastClick.hrefLocation !== hrefLocation) {
    return false;
  }
  // une requête partie avant le clic (déjà en vol, ou rejouée par buffered) n'en vient pas
  const delay = entry.startTime - lastClick.time;
  return delay >= 0 && delay <= CLICK_ATTRIBUTION_WINDOW_MS;
}

function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function clickListener(e: MouseEvent) {
  const target = e.target instanceof Element ? e.target : null;
  // un clic sur l'interface Tuello (pastilles, panneau) n'est pas une action de la page
  if (!target || target.closest('[id*="tuello"]')) {
    return;
  }
  const element = target.closest<HTMLElement>(CLICKABLE_SELECTOR);
  if (!element) {
    // Sans contrôle identifiable, le track devenait un fantôme (XPath "/undefined",
    // jamais affiché) et échappait au dédoublonnage : il sera un track PAGE.
    lastClick = undefined;
    return;
  }
  const rect = element.getBoundingClientRect();
  // XPath et position calculés au clic : l'élément peut avoir disparu quand la réponse arrive
  lastClick = {
    time: e.timeStamp,
    x: e.pageX,
    y: e.pageY,
    hrefLocation: window.location.href,
    element: getXPath(element),
    parentPosition: isFixedPosition(element) ? 'fixed' : 'absolute',
    htmlCoordinates: {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    }
  };
}

function createBubble(letter: string): HTMLDivElement {
  const div = document.createElement('div');
  div.classList.add('tuello-track');
  div.style.paddingTop = '2px';
  div.style.width = '30px';
  div.style.height = '30px';
  div.style.zIndex = '99999999';
  div.style.borderRadius = '50%';
  div.style.backgroundColor = 'rgba(209, 37, 102, 0.9)';
  div.style.color = 'white';
  div.style.textAlign = 'center';
  div.style.font = 'bold italic large Palatino, serif';
  div.appendChild(document.createTextNode(letter));
  return div;
}

/**
 * Crée la pastille d'un track et retourne l'élément qui porte son id.
 * La position est fixée ensuite par renderTracks.
 */
function displayTrack(track: Track, trackElement: HTMLElement): HTMLElement {
  if (track.type === TrackType.PAGE) {
    const trackDiv = createBubble('p');
    trackDiv.style.margin = '0px';
    trackDiv.id = track.id;
    trackDiv.style.position = track.parentPosition;
    trackDiv.style.left = '10px';
    trackDiv.style.fontSize = '12px';
    trackDiv.onclick = (e) => {
      viewTracks(track.id);
      e.stopPropagation();
    };
    trackDiv.title = getDisplayData(track);
    document.body.appendChild(trackDiv);
    return trackDiv;
  }

  const div = createBubble('c');
  div.style.border = '3px solid #D12566';
  div.style.position = 'absolute';
  div.onclick = () => viewTracks(track.id);

  let elt: HTMLElement = div;
  if (track.parentPosition === 'fixed' && trackElement) {
    // élément dans un conteneur fixe : la pastille est accrochée à côté de lui
    div.style.top = '0';
    elt = document.createElement('div');
    elt.id = track.id;
    elt.style.position = 'absolute';
    trackElement.insertAdjacentElement('afterend', elt);
    elt.appendChild(div);
  } else {
    div.id = track.id;
    document.body.append(div);
  }

  // survol : on surligne le lien ou le bouton. L'élément est relu à chaque fois,
  // la page ayant pu le remplacer depuis la création de la pastille.
  elt.onmouseenter = () => highlight(track, true);
  elt.onmouseleave = () => highlight(track, false);
  elt.title = getDisplayData(track);
  return elt;
}

/**
 * Place la pastille CLICK d'après la position actuelle de l'élément : les
 * coordonnées mémorisées au clic devenaient fausses dès que la mise en page bougeait.
 */
function positionClickBubble(track: Track, bubble: HTMLElement, trackElement: HTMLElement) {
  let left: number;
  let top: number;
  let target = bubble;
  if (track.parentPosition === 'fixed' && trackElement) {
    // pastille dans un conteneur accroché après l'élément : décalée de sa largeur
    target = bubble.firstElementChild as HTMLElement;
    left = trackElement.offsetWidth;
    top = 0;
  } else if (trackElement) {
    const rect = trackElement.getBoundingClientRect();
    left = rect.right + window.scrollX;
    top = rect.bottom + window.scrollY;
  } else if (track.htmlCoordinates) {
    left = track.htmlCoordinates.left + track.htmlCoordinates.width;
    top = track.htmlCoordinates.top + track.htmlCoordinates.height;
  } else {
    left = track.x;
    top = track.y;
  }
  // n'écrire que si la position change : évite des recalculs de mise en page inutiles
  const leftPx = left + 'px';
  const topPx = top + 'px';
  if (target && target.style.left !== leftPx) {
    target.style.left = leftPx;
  }
  if (target && target.style.top !== topPx) {
    target.style.top = topPx;
  }
}

function highlight(track: Track, on: boolean) {
  const trackElement = findElement(track.element);
  if (!trackElement) {
    return;
  }
  trackElement.classList.toggle('tuello-background-color', on);
  trackElement.classList.toggle('tuello-white-texte', on);
  for (const child of Array.from(trackElement.children)) {
    child.classList.toggle('tuello-white-texte', on);
  }
}

/**
 * Permet d'afficher les données que l'on veut tracer
 */
function getDisplayData(track: Track): string {
  const dataDisplayType = settings.tuelloTrackDataDisplayType;
  const dataDisplay = settings.tuelloTrackDataDisplay;
  let data = track.url.length > 50 ? track.url.slice(0, 50) + ' ...' : track.url;
  if (dataDisplay) {
    if (dataDisplayType === 'body') {
      if (track.body) {
        data = findInJson(track.body, dataDisplay);
      }
    } else {
      if (track.querystring) {
        data = findInJson(track.querystring, dataDisplay);
      }
    }
  }
  return data;
}

function findInJson(data: any, keyString: string) {
  let result = '';
  const doc = JsonFind(data);
  try {
    if (keyString.includes(',') || keyString.includes(';')) {
      keyString.split(/,|;/).forEach((elt) => {
        result += result ? '\u000d' : '';
        result += elt + ' : ' + doc.findValues(elt)[elt];
      });
    } else {
      result = doc.findValues(keyString);
      result = `${keyString} : ${result[keyString]}`;
    }
  } catch (e) {
    result = data;
  }
  return result;
}

function viewTracks(trackId: string) {
  chrome.runtime.sendMessage(
    {
      action: 'ACTIVATE'
    },
    (response) => {
      chrome.runtime.sendMessage(
        {
          action: 'TRACK_VIEW',
          value: {
            trackId: trackId ? trackId : 0,
            currentHrefLocation: window.location.href
          }
        },
        () => {}
      );
    }
  );
}

export function removeTracks() {
  const tracks = document.querySelectorAll(`div[id^="${TRACK_ID_PREFIX}"]`);
  tracks.forEach(function (track) {
    track.remove();
  });
}
