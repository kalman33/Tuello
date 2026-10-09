import { Track } from '../models/Track';
import { TrackType } from '../models/TrackType';
import { loadCompressed, saveCompressed } from '../utils/compression';
import { clickInside, getBodyFromData, removeDuplicateEntries, removeURLPortAndQueryString } from '../utils/utils';

/**
 * Persistance du tracker de ressources, centralisée dans le service worker.
 *
 * Les tracks étaient auparavant ajoutés par le content script en
 * lecture → ajout → écriture, lancé en parallèle pour chaque ressource, chaque
 * frame et chaque onglet : la dernière écriture écrasait les autres. Le service
 * worker étant unique, sérialiser ici suffit à ne plus perdre de track.
 */

interface TrackBody {
  key: string;
  body: any;
}

/** Plafond des tracks conservés : tout est décompressé à chaque rendu côté page */
const TRACKS_MAX_SIZE = 500;
/** Seules les requêtes correspondant aux données traquées sont gardées : peu d'entrées suffisent */
const TRACKS_BODY_MAX_SIZE = 20;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

let trackPlay = false;
let trackData: string | undefined;
let tracksBody: TrackBody[] = [];
let stateReady: Promise<void> = Promise.resolve();

// Chaîne de promesses : chaque écriture attend la fin de la précédente.
let writeChain: Promise<unknown> = Promise.resolve();

/**
 * À appeler au niveau racine du service worker : un écouteur webRequest
 * enregistré plus tard (dans onInstalled par exemple) disparaît dès la première
 * mise en veille du service worker, et les bodies n'étaient plus capturés.
 */
export function initTrackStore(): void {
  // L'état mémoire est perdu à chaque mise en veille : on le recharge, et les
  // écouteurs attendent ce chargement avant de s'en servir.
  stateReady = Promise.all([chrome.storage.local.get<Record<string, any>>(['trackPlay', 'tuelloTrackData']), loadCompressed<TrackBody[]>('tuelloTracksBody').catch(() => null)])
    .then(([settings, bodies]) => {
      trackPlay = !!settings.trackPlay;
      trackData = settings.tuelloTrackData;
      tracksBody = Array.isArray(bodies) ? bodies : [];
    })
    .catch(() => undefined);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    if (changes.trackPlay) {
      trackPlay = !!changes.trackPlay.newValue;
    }
    if (changes.tuelloTrackData) {
      trackData = changes.tuelloTrackData.newValue as string;
    }
  });

  // Filtré sur les types XHR/fetch/beacon : les seuls dont le body nous intéresse,
  // et cela évite de réveiller le service worker pour chaque image ou script.
  chrome.webRequest.onBeforeRequest.addListener(captureRequestBody, { urls: ['<all_urls>'], types: ['xmlhttprequest', 'ping'] }, ['requestBody']);
}

function captureRequestBody(details: chrome.webRequest.OnBeforeRequestDetails): undefined {
  if (!BODY_METHODS.has(details.method)) {
    return undefined;
  }
  const bytes = details.requestBody?.raw?.[0]?.bytes;
  stateReady.then(() => {
    // Tracker inactif ou requête non traquée : rien à décoder, compresser ni écrire
    if (!trackPlay || !trackData || !details.url.includes(trackData)) {
      return;
    }
    let body;
    try {
      body = getBodyFromData(bytes);
    } catch {
      // Le parsing du body a échoué - on continue avec body = undefined
    }
    tracksBody = removeDuplicateEntries([{ key: details.url, body }, ...tracksBody]).slice(0, TRACKS_BODY_MAX_SIZE);
    saveCompressed('tuelloTracksBody', tracksBody).catch(console.error);
  });
  // listener non bloquant (extraInfoSpec sans 'blocking') : il observe seulement
  return undefined;
}

/**
 * Ajoute un track s'il n'existe pas déjà. Retourne true s'il a été retenu.
 */
export function appendTrack(track: Track): Promise<boolean> {
  return chain(() => persistTrack(track));
}

/** Vide les tracks et les bodies capturés, sur la même chaîne que les ajouts */
export function clearTracks(): Promise<void> {
  return chain(async () => {
    await stateReady;
    tracksBody = [];
    await chrome.storage.local.remove(['tuelloTracks', 'tuelloTracksBody']);
  });
}

function chain<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task);
  // La chaîne ne doit jamais être rompue par une erreur
  writeChain = result.catch(() => undefined);
  return result;
}

async function persistTrack(track: Track): Promise<boolean> {
  if (!track?.url) {
    return false;
  }
  await stateReady;
  const tracks = (await loadCompressed<Track[]>('tuelloTracks')) || [];
  if (isDuplicate(tracks, track)) {
    return false;
  }

  // Le body est capturé ici à l'envoi de la requête : il est forcément connu
  // quand la page signale la ressource, une fois la réponse reçue.
  const body = findTrackBody(track.url);
  if (body !== undefined) {
    track.body = body;
  }
  tracks.push(track);
  await saveCompressed('tuelloTracks', tracks.length > TRACKS_MAX_SIZE ? tracks.slice(-TRACKS_MAX_SIZE) : tracks);
  return true;
}

function isDuplicate(tracks: Track[], track: Track): boolean {
  if (track.type === TrackType.PAGE) {
    return tracks.some((elt) => elt.type === TrackType.PAGE && elt.hrefLocation === track.hrefLocation && elt.url === track.url);
  }
  return tracks.some((elt) => elt.type === TrackType.CLICK && elt.hrefLocation === track.hrefLocation && elt.url === track.url && clickInside(elt.htmlCoordinates, track.x, track.y));
}

function findTrackBody(url: string): any {
  const target = removeURLPortAndQueryString(url);
  return tracksBody.find(({ key }) => removeURLPortAndQueryString(key) === target)?.body;
}
