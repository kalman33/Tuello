import { logData } from './utils/utils';

// ============================================================================
// Types et Interfaces
// ============================================================================

interface TuelloRecord {
  key: string;
  // Méthode HTTP enregistrée. Absente sur les mocks antérieurs et sur les fichiers
  // importés : le mock s'applique alors à toutes les méthodes (joker).
  method?: string;
  response: unknown;
  httpCode: number;
  delay?: number;
  headers?: Record<string, string>;
}

interface HttpMessage {
  type: string;
  url: string;
  response?: unknown;
  delay?: number;
  status?: number;
  method?: string;
  body?: unknown;
  hrefLocation?: string;
  headers?: Record<string, string>;
}

interface ExtendedXMLHttpRequest extends XMLHttpRequest {
  originalURL?: string;
  xhrMethod?: string;
  xhrBody?: Document | XMLHttpRequestBodyInit | null;
  interceptorManager?: InterceptorManager;
}

declare global {
  interface Window {
    // Type flexible pour supporter le template (string) et l'utilisation normale (array)
    tuelloRecords?: TuelloRecord[] | string | undefined;
  }
}

// ============================================================================
// Constantes
// ============================================================================

// Ressources chargées par Tuello lui-même (iframe, assets) et live-reload des
// serveurs de dev. On cible le schéma de l'extension plutôt que la sous-chaîne
// "tuello", qui rendait impossible l'enregistrement d'une API contenant ce mot.
const EXCLUDED_URL_PATTERNS = ['chrome-extension://', 'moz-extension://', 'sockjs'] as const;

// Nombre maximum de messages conservés tant que l'utilisateur n'a pas activé
// l'enregistrement : borne la mémoire si la fenêtre de boot ne se referme jamais.
const MAX_QUEUED_MESSAGES = 200;
const MESSAGE_TYPES = {
  RECORD_HTTP: 'RECORD_HTTP',
  ADD_HTTP_CALL_FOR_TAGS: 'ADD_HTTP_CALL_FOR_TAGS',
  MOCK_HTTP_ACTIVATED: 'MOCK_HTTP_ACTIVATED',
  RECORD_HTTP_ACTIVATED: 'RECORD_HTTP_ACTIVATED',
  RECORD_HTTP_CALL_FOR_TAGS: 'RECORD_HTTP_CALL_FOR_TAGS',
  MOCK_HTTP_TUELLO_RECORDS: 'MOCK_HTTP_TUELLO_RECORDS'
} as const;

const INTERCEPTOR_NAMES = {
  HTTP_RECORDER: 'intercepteurHTTPRecorder',
  HTTP_MOCK: 'intercepteurHTTPMock',
  HTTP_TAGS: 'intercepteurHTTPTags'
} as const;

// ============================================================================
// Sauvegarde des méthodes originales
// ============================================================================

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
const originalFetch = window.fetch.bind(window);

// ============================================================================
// État global
// ============================================================================

let messageForHTTPRecorderQueue: HttpMessage[] = [];
let messageForHTTPTagsQueue: HttpMessage[] = [];
let deepMockLevel = 0;

// État pour le mock HTTP - gestion de la race condition
let tuelloRecordsReady = false;
let mockUserActivated = false;
let pendingMockXhrQueue: Array<{
  xhr: ExtendedXMLHttpRequest;
  originalCallback: ((this: XMLHttpRequest, ev: Event) => void) | null;
  body?: Document | XMLHttpRequestBodyInit | null;
}> = [];
let pendingMockFetchQueue: Array<{
  resolve: (response: Response) => void;
  reject: (reason?: unknown) => void;
  url: string;
  method: string;
  args: Parameters<typeof fetch>;
}> = [];

// ============================================================================
// Index de recherche optimisé pour les mocks
// ============================================================================

interface NormalizedRecord {
  record: TuelloRecord;
  normalizedKey: string;
  segments: string[];
  hasWildcard: boolean;
}


// Index pour recherche rapide O(1). Une même URL peut porter plusieurs records
// (un par méthode HTTP), conservés dans l'ordre du tableau : le premier gagne.
let mockIndexExact: Map<string, NormalizedRecord[]> = new Map();
// Indique que l'index reflète bien les records courants (y compris une liste vide) :
// sans ce drapeau, vider les mocks laissait findMockRecord retomber sur l'ancien index.
let mockIndexBuilt = false;
// Index par suffixe (derniers 3 segments) pour comparaison par suffixe
let mockIndexSuffix: Map<string, NormalizedRecord[]> = new Map();
// Liste des mocks avec wildcards (doivent être testés par regex)
let mockWildcardRecords: NormalizedRecord[] = [];
// Cache LRU des recherches récentes (utilise l'ordre d'insertion de Map pour O(1))
const CACHE_MAX_SIZE = 500;
let mockSearchCache: Map<string, TuelloRecord | null> = new Map();
// Version de l'index pour invalider le cache
let mockIndexVersion = 0;

// Cache des expressions régulières compilées (évite la recompilation à chaque requête)
const regexCache = new Map<string, RegExp>();
const REGEX_CACHE_MAX_SIZE = 1000;

const getCachedRegex = (pattern: string): RegExp => {
  let regex = regexCache.get(pattern);
  if (!regex) {
    if (regexCache.size >= REGEX_CACHE_MAX_SIZE) {
      // Supprimer la plus ancienne entrée
      const oldest = regexCache.keys().next().value;
      if (oldest !== undefined) regexCache.delete(oldest);
    }
    const escaped = pattern.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');
    regex = new RegExp(`^${escaped}$`);
    regexCache.set(pattern, regex);
  }
  return regex;
};

// ============================================================================
// Utilitaires
// ============================================================================

const isExcludedUrl = (url: string): boolean => EXCLUDED_URL_PATTERNS.some((pattern) => url.includes(pattern));

const sleepAsync = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

const getStatusText = (code: number): string => HTTP_STATUS_TEXT[code] || '';

// Headers qui décrivent le transport de la réponse d'origine : les rejouer tels
// quels annoncerait une taille ou une compression qui ne sont plus celles du mock.
const TRANSPORT_HEADERS = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive', 'trailer', 'upgrade']);

// Statuts pour lesquels la spec Fetch interdit un corps : construire une Response
// avec un body sur l'un d'eux lève un TypeError.
const BODYLESS_STATUS = new Set([204, 205, 304]);

// Un record importé ou édité à la main peut ne pas avoir de httpCode (ou en avoir un
// hors plage) : new Response() lèverait alors un RangeError et xhr.status vaudrait
// undefined. On retombe sur 200, comme le fait déjà Response par défaut.
const normalizeHttpStatus = (code: unknown): number => {
  const parsed = typeof code === 'number' ? code : parseInt(String(code ?? ''), 10);
  if (!Number.isFinite(parsed)) return 200;
  const truncated = Math.trunc(parsed);
  return truncated < 200 || truncated > 599 ? 200 : truncated;
};

// JSON.stringify(undefined) renvoie undefined : on garantit toujours une chaîne.
const serializeMockBody = (response: unknown): string => {
  const serialized = JSON.stringify(response);
  return serialized === undefined ? '' : serialized;
};

// Un abort explicite (AbortController) doit toujours rejeter : le convertir en
// réponse casserait les patterns d'annulation de l'application.
const isAbortError = (error: unknown): boolean => !!error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError';

// Clone la réponse du mock pour éviter que l'application consommatrice ne mute
// l'objet stocké dans le record (sinon les appels suivants renvoient la version modifiée).
const cloneMockResponse = (response: unknown): unknown => {
  if (response === null || response === undefined) return response;
  try {
    return structuredClone(response);
  } catch {
    try {
      return JSON.parse(JSON.stringify(response));
    } catch {
      return response;
    }
  }
};

// Extrait la méthode d'un appel fetch : soit de l'init, soit du Request, sinon GET.
const extractFetchMethod = (args: Parameters<typeof fetch>): string => {
  const init = args[1] as RequestInit | undefined;
  if (init?.method) return init.method.toUpperCase();
  const input = args[0];
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
};

// Extrait l'URL d'un input fetch qui peut être une string, un URL ou un Request.
const extractFetchUrl = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return '';
};

// Fusionne les headers par défaut avec ceux du record en normalisant la casse
// (sinon on peut se retrouver avec "Content-Type" et "content-type" dupliqués).
const buildMockHeaders = (responseBody: string, recordHeaders?: Record<string, string>): Record<string, string> => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'content-length': new TextEncoder().encode(responseBody).length.toString()
  };
  if (recordHeaders) {
    for (const [key, value] of Object.entries(recordHeaders)) {
      const name = key.toLowerCase();
      if (TRANSPORT_HEADERS.has(name)) continue;
      headers[name] = value;
    }
  }
  return headers;
};

// Une origine opaque (page sandboxée, about:blank) vaut "null" : postMessage
// échouerait avec cette valeur en cible.
const POST_TARGET_ORIGIN = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '*';

const sendMessage = (targetWindow: Window | null, message: HttpMessage): void => {
  if (!targetWindow) return;
  try {
    // postMessage clone déjà la structure : pas besoin de pré-sérialiser en JSON,
    // ce qui doublait le coût sur les grosses réponses.
    targetWindow.postMessage(message, POST_TARGET_ORIGIN);
  } catch {
    // Contenu non clonable (stream, proxy, fonction...) : repli sur une copie JSON
    try {
      targetWindow.postMessage(JSON.parse(JSON.stringify(message)), POST_TARGET_ORIGIN);
    } catch {
      logData(`- Tuello HTTP - Message non transmissible pour ${message.url}`);
    }
  }
};

const addToQueue = (message: HttpMessage, queue: HttpMessage[]): void => {
  // Éviction FIFO : on préfère perdre les plus anciens plutôt que la page
  if (queue.length >= MAX_QUEUED_MESSAGES) {
    queue.shift();
  }
  queue.push(message);
};

const flushQueue = (targetWindow: Window | null, queue: HttpMessage[]): void => {
  while (queue.length > 0) {
    const message = queue.shift();
    if (message) sendMessage(targetWindow, message);
  }
};

const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// Les imports de librairie stockent "window.location.origin + '/api'" sous la forme
// "###window.location.origin### /api". Sans résolution, la clé partait dans la
// résolution relative et ne matchait que par chance (via la comparaison par suffixe).
const ORIGIN_PLACEHOLDER = /^###window\.location\.origin###\s*/;

const resolveOriginPlaceholder = (url: string): string => (ORIGIN_PLACEHOLDER.test(url) ? window.location.origin + url.replace(ORIGIN_PLACEHOLDER, '/').replace(/^\/+/, '/') : url);

const resolveRelativeUrl = (url: string): string => {
  // Si c'est déjà une URL absolue, la retourner
  if (url.match(/^https?:\/\//)) {
    return url;
  }
  // Résoudre l'URL relative par rapport à la page courante
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
};

const removeURLPortAndProtocol = (url: string): string => {
  // D'abord résoudre le placeholder d'origine puis les URLs relatives
  const resolvedUrl = resolveRelativeUrl(resolveOriginPlaceholder(url));
  try {
    const parseURL = new URL(resolvedUrl);
    // Retourner uniquement le pathname (+ search + hash), sans le hostname
    return parseURL.pathname + parseURL.search + parseURL.hash;
  } catch {
    return url;
  }
};

const normalizeUrl = (url: string): string => {
  if (!url.includes('..')) return url;

  const parts = url.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      stack.pop();
    } else if (part !== '.' && part !== '') {
      stack.push(part);
    }
  }

  return stack.join('/');
};

// ============================================================================
// Indexation des mocks pour recherche optimisée
// ============================================================================

/**
 * Normalise une URL pour l'indexation (applique deepMockLevel)
 */
const normalizeUrlForIndex = (url: string): { normalized: string; segments: string[] } => {
  let normalized = removeURLPortAndProtocol(url);

  let inc = deepMockLevel;
  while (inc > 0) {
    const parts = normalized.split('/');
    const prefix = parts.slice(0, inc).join('/');
    normalized = normalized.replace(prefix, '');
    if (normalized) break;
    inc--;
  }

  normalized = normalizeUrl(normalized.replace(/^\//, ''));
  const segments = normalized.split('/').filter((s) => s);

  return { normalized, segments };
};

/**
 * Choisit, parmi des records dont l'URL correspond déjà, celui qui répond à la
 * méthode HTTP de la requête :
 *  - une correspondance exacte de méthode est prioritaire ;
 *  - à défaut, un mock sans méthode (ancien format ou import) sert de joker ;
 *  - les candidats sont parcourus dans l'ordre du tableau, donc le premier gagne.
 */
const pickByMethod = (candidates: NormalizedRecord[] | undefined, method?: string): TuelloRecord | undefined => {
  if (!candidates || candidates.length === 0) return undefined;
  // Méthode inconnue côté requête : on ne filtre pas (comportement historique)
  if (!method) return candidates[0].record;

  const requestMethod = method.toUpperCase();
  let genericMatch: TuelloRecord | undefined;

  for (const candidate of candidates) {
    const recordMethod = candidate.record.method;
    if (!recordMethod) {
      if (!genericMatch) genericMatch = candidate.record;
    } else if (recordMethod.toUpperCase() === requestMethod) {
      return candidate.record;
    }
  }

  return genericMatch;
};

/**
 * Un record correspond-il à la méthode de la requête ? (utilisé par la recherche
 * linéaire de repli, qui n'a pas de notion de priorité)
 */
const methodMatches = (record: TuelloRecord, method?: string): boolean => !record.method || !method || record.method.toUpperCase() === method.toUpperCase();

/**
 * Compare les segments d'un mock à ceux d'une URL plus courte (contextRoot absent
 * de la requête, ex. mock "global/api/users" vs URL "api/users"), en respectant
 * les wildcards présents dans le mock.
 *
 * Au moins un segment doit correspondre littéralement : sans cette garde, un mock
 * terminé par "/*" intercepte n'importe quelle URL d'un seul segment (son suffixe
 * de comparaison se réduit alors à "*", qui matche tout). Un mock volontairement
 * universel ("*") reste géré par la comparaison sur la clé complète.
 */
const matchesBySuffix = (candidateSegments: string[], segments: string[]): boolean => {
  if (segments.length === 0 || candidateSegments.length <= segments.length) return false;

  const mockSuffix = candidateSegments.slice(-segments.length);
  let hasLiteralMatch = false;

  const allMatch = segments.every((seg, idx) => {
    const mockSeg = mockSuffix[idx];
    if (mockSeg.includes('*')) {
      return getCachedRegex(mockSeg).test(seg);
    }
    hasLiteralMatch = true;
    return seg === mockSeg;
  });

  return allMatch && hasLiteralMatch;
};

/**
 * Génère une clé de suffixe pour l'index (derniers N segments)
 */
const getSuffixKey = (segments: string[], count: number = 3): string => {
  const suffix = segments.slice(-count);
  // Remplacer les wildcards par un placeholder pour l'indexation
  return suffix.map((s) => (s.includes('*') ? '__WILDCARD__' : s)).join('/');
};

/**
 * Construit l'index de recherche à partir des records
 */
const buildMockIndex = (records: TuelloRecord[]): void => {
  const startTime = performance.now();

  // Réinitialiser les index
  mockIndexExact.clear();
  mockIndexSuffix.clear();
  mockWildcardRecords = [];
  mockSearchCache.clear();
  mockIndexVersion++;
  mockIndexBuilt = true;

  for (const record of records) {
    const { normalized, segments } = normalizeUrlForIndex(record.key);
    const hasWildcard = record.key.includes('*');

    const normalizedRecord: NormalizedRecord = {
      record,
      normalizedKey: normalized,
      segments,
      hasWildcard
    };

    if (hasWildcard) {
      // Les wildcards ne peuvent pas être indexés par suffixe : la clé calculée pour
      // une URL réelle ne contient jamais de placeholder et ne les retrouverait pas.
      // Ils sont donc testés séparément (regex complète puis suffixe).
      mockWildcardRecords.push(normalizedRecord);
      continue;
    }

    // Index exact pour recherche O(1). On empile au lieu d'écraser : plusieurs
    // méthodes peuvent partager la même URL, et le premier record du tableau
    // reste prioritaire (cohérent avec la recherche linéaire de repli).
    const exactBucket = mockIndexExact.get(normalized);
    if (exactBucket) {
      exactBucket.push(normalizedRecord);
    } else {
      mockIndexExact.set(normalized, [normalizedRecord]);
    }

    // Index par suffixe pour la comparaison par suffixe
    // On indexe par les 1, 2 et 3 derniers segments
    for (let i = 1; i <= Math.min(3, segments.length); i++) {
      const suffixKey = getSuffixKey(segments, i);
      if (!mockIndexSuffix.has(suffixKey)) {
        mockIndexSuffix.set(suffixKey, []);
      }
      mockIndexSuffix.get(suffixKey)!.push(normalizedRecord);
    }
  }

  const elapsed = performance.now() - startTime;
  logData(`- Mock HTTP - Index construit en ${elapsed.toFixed(2)}ms (${records.length} records, ${mockIndexExact.size} exact, ${mockWildcardRecords.length} wildcards)`);
};

/**
 * Ajoute un résultat au cache LRU.
 * Utilise l'ordre d'insertion natif de Map pour un LRU en O(1) :
 * delete() + set() déplace l'entrée en fin de map (la plus récente).
 * keys().next() retourne toujours la plus ancienne.
 */
const addToCache = (key: string, result: TuelloRecord | null): void => {
  if (mockSearchCache.has(key)) {
    mockSearchCache.delete(key); // Supprimer pour réinsérer en fin (plus récent)
  } else if (mockSearchCache.size >= CACHE_MAX_SIZE) {
    const oldest = mockSearchCache.keys().next().value;
    if (oldest !== undefined) mockSearchCache.delete(oldest);
  }
  mockSearchCache.set(key, result);
};

/**
 * Recherche optimisée d'un mock pour une URL et une méthode HTTP
 */
const findMockRecordOptimized = (url: string, method?: string): TuelloRecord | undefined => {
  const { normalized, segments } = normalizeUrlForIndex(url);
  // La méthode fait partie de la clé de cache : deux verbes sur la même URL
  // peuvent répondre des mocks différents.
  const cacheKey = `${mockIndexVersion}:${(method || '').toUpperCase()}:${normalized}`;

  // 1. Vérifier le cache
  if (mockSearchCache.has(cacheKey)) {
    const cached = mockSearchCache.get(cacheKey);
    return cached ?? undefined;
  }

  // 2. Recherche exacte O(1)
  const exactMatch = pickByMethod(mockIndexExact.get(normalized), method);
  if (exactMatch) {
    addToCache(cacheKey, exactMatch);
    return exactMatch;
  }

  // 3. Recherche par suffixe
  // Essayer avec les derniers 3, 2, puis 1 segments
  for (let i = Math.min(3, segments.length); i >= 1; i--) {
    const suffixKey = getSuffixKey(segments, i);
    const candidates = mockIndexSuffix.get(suffixKey);

    if (candidates) {
      const suffixMatches = candidates.filter((candidate) => matchesBySuffix(candidate.segments, segments));
      const suffixMatch = pickByMethod(suffixMatches, method);
      if (suffixMatch) {
        addToCache(cacheKey, suffixMatch);
        return suffixMatch;
      }
    }
  }

  // 4. Vérifier les wildcards, absents des index précédents : d'abord par regex
  // complète, puis par suffixe comme le fait la recherche linéaire de repli.
  const wildcardMatches = mockWildcardRecords.filter(
    (wildcardRecord) => getCachedRegex(wildcardRecord.normalizedKey).test(normalized) || matchesBySuffix(wildcardRecord.segments, segments)
  );
  const wildcardMatch = pickByMethod(wildcardMatches, method);
  if (wildcardMatch) {
    addToCache(cacheKey, wildcardMatch);
    return wildcardMatch;
  }

  // Pas de match trouvé
  addToCache(cacheKey, null);
  return undefined;
};

const compareWithMockLevel = (url1: string, url2: string): boolean => {
  if (!url1 || !url2 || typeof url1 !== 'string' || typeof url2 !== 'string') {
    return false;
  }

  let normalizedUrl1 = removeURLPortAndProtocol(url1);
  let normalizedUrl2 = removeURLPortAndProtocol(url2);

  let inc = deepMockLevel;
  while (inc > 0) {
    const prefix1 = normalizedUrl1.split('/').slice(0, inc).join('/');
    const prefix2 = normalizedUrl2.split('/').slice(0, inc).join('/');
    normalizedUrl1 = normalizedUrl1.replace(prefix1, '');
    normalizedUrl2 = normalizedUrl2.replace(prefix2, '');
    if (normalizedUrl1 && normalizedUrl2) break;
    inc--;
  }

  normalizedUrl1 = normalizeUrl(normalizedUrl1.replace(/^\//, ''));
  normalizedUrl2 = normalizeUrl(normalizedUrl2.replace(/^\//, ''));

  // Comparaison exacte avec support des wildcards (*)
  if (getCachedRegex(normalizedUrl2).test(normalizedUrl1)) {
    return true;
  }

  // Comparaison par suffixe : l'URL actuelle peut avoir moins de segments (contextRoot manquant)
  // Ex: mock = "global/text1/text2/text3", actuel = "text1/text2/text3" → match
  // Même règle que la recherche indexée, pour que les deux chemins concordent.
  const segments1 = normalizedUrl1.split('/').filter((s) => s);
  const segments2 = normalizedUrl2.split('/').filter((s) => s);

  return matchesBySuffix(segments2, segments1);
};

const findMockRecord = (url: string, method?: string): TuelloRecord | undefined => {
  const records = window.tuelloRecords;
  if (!records || typeof records === 'string') return undefined;

  // Utiliser la recherche optimisée dès que l'index reflète les records courants.
  // On se base sur mockIndexBuilt et non sur la taille de l'index : un index
  // volontairement vide (tous les mocks supprimés) doit rester prioritaire.
  if (mockIndexBuilt) {
    return findMockRecordOptimized(url, method);
  }

  // Fallback sur la recherche linéaire si l'index n'est pas construit
  return records.find((record: TuelloRecord) => compareWithMockLevel(url, record.key) && methodMatches(record, method));
};

/**
 * Construit la valeur de xhr.response en respectant responseType : la spec impose
 * une chaîne pour '' et 'text', un objet pour 'json', un Blob ou un ArrayBuffer
 * pour les types binaires. On renvoyait systématiquement l'objet JSON.
 */
const buildXhrResponseValue = (responseType: XMLHttpRequestResponseType, record: TuelloRecord, responseBody: string): unknown => {
  if (!responseBody) return responseType === 'json' || responseType === 'document' ? null : '';

  switch (responseType) {
    case 'json':
      return cloneMockResponse(record.response);
    case 'blob':
      return new Blob([responseBody], { type: 'application/json' });
    case 'arraybuffer':
      return new TextEncoder().encode(responseBody).buffer;
    case 'document':
      // On ne fabrique pas de Document à partir d'un mock JSON
      return null;
    default:
      return responseBody;
  }
};

/**
 * Applique un record en réponse à un XHR intercepté.
 * Les propriétés sont posées immédiatement (l'application peut les lire au retour
 * de send()) et les évènements dispatchés en asynchrone, pour laisser le temps
 * d'attacher les listeners.
 */
const applyMockToXhr = (xhr: ExtendedXMLHttpRequest, record: TuelloRecord, url: string): void => {
  const status = normalizeHttpStatus(record.httpCode);
  const responseBody = BODYLESS_STATUS.has(status) ? '' : serializeMockBody(record.response);
  // xhr.responseType doit être lu avant que les propriétés ne soient redéfinies
  const mockedResponse = buildXhrResponseValue(xhr.responseType, record, responseBody);

  Object.defineProperty(xhr, 'readyState', { writable: true, value: XMLHttpRequest.DONE });
  Object.defineProperty(xhr, 'status', { writable: true, value: status });
  Object.defineProperty(xhr, 'statusText', { writable: true, value: getStatusText(status) });
  Object.defineProperty(xhr, 'responseText', { writable: true, value: responseBody });
  Object.defineProperty(xhr, 'response', { writable: true, value: mockedResponse });
  Object.defineProperty(xhr, 'responseURL', { writable: true, value: url });

  const mockHeaders = buildMockHeaders(responseBody, record.headers);

  xhr.getResponseHeader = (name: string) => mockHeaders[name.toLowerCase()] ?? null;
  xhr.getAllResponseHeaders = () =>
    Object.entries(mockHeaders)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');

  logData('- Mock HTTP - Mock de ' + url);

  // dispatchEvent('readystatechange') déclenche déjà le handler xhr.onreadystatechange
  // — ne pas appeler originalCallback manuellement, sinon il est invoqué 2 fois.
  setTimeout(() => {
    xhr.dispatchEvent(new Event('readystatechange'));
    xhr.dispatchEvent(new Event('load'));
    xhr.dispatchEvent(new Event('loadend'));
  }, record.delay || 0);
};

// Réponse de repli quand une requête non mockée échoue alors que le mock est actif
// (typiquement un blocage CORS) : on préfère une 404 explicite à une exception.
const buildFallbackResponse = (url: string): Response =>
  new Response(JSON.stringify({ error: 'Request failed', url }), {
    status: 404,
    statusText: 'Not Found',
    headers: { 'Content-Type': 'application/json' }
  });

// Traite la queue des XHR en attente de mock
const processPendingMockXhrQueue = (): void => {
  logData(`- Mock HTTP - Traitement de ${pendingMockXhrQueue.length} requêtes XHR en attente`);

  while (pendingMockXhrQueue.length > 0) {
    const pending = pendingMockXhrQueue.shift();
    if (!pending) continue;

    const { xhr, originalCallback, body } = pending;
    const url = xhr.originalURL || '';
    const record = findMockRecord(url, xhr.xhrMethod);

    if (record) {
      applyMockToXhr(xhr, record, url);
    } else {
      // Pas de mock trouvé - laisser passer la requête normalement
      logData('- Mock HTTP - Pas de mock pour ' + url + ' - Requête envoyée normalement');

      // Restaurer le callback original
      if (originalCallback) {
        xhr.onreadystatechange = originalCallback;
      }

      // Exécuter les intercepteurs (recorder, tags, etc.)
      xhr.interceptorManager?.runInterceptorsXHR(xhr);

      // Envoyer la requête originale
      originalSend.call(xhr, body);
    }
  }
};

// Traite la queue des fetch en attente de mock
const processPendingMockFetchQueue = (): void => {
  logData(`- Mock HTTP - Traitement de ${pendingMockFetchQueue.length} requêtes Fetch en attente`);

  while (pendingMockFetchQueue.length > 0) {
    const pending = pendingMockFetchQueue.shift();
    if (!pending) continue;

    const { resolve, reject, url, method, args } = pending;
    const record = findMockRecord(url, method);

    if (record) {
      logData('- Mock HTTP - Mock de ' + url);
      if (record.delay) {
        setTimeout(() => resolve(createMockedResponse(new Response(), record)), record.delay);
      } else {
        resolve(createMockedResponse(new Response(), record));
      }
    } else {
      // Pas de mock trouvé - laisser passer la requête normalement
      logData('- Mock HTTP - Pas de mock pour ' + url + ' - Requête envoyée normalement');
      originalFetch(...args)
        .then((response) => manager.runInterceptorsFetch(response, ...args))
        .then(resolve)
        .catch((error) => {
          // Un abort doit rester un abort : seule une erreur réseau/CORS devient une 404
          if (isAbortError(error)) {
            reject(error);
            return;
          }
          logData(`- Tuello HTTP - Erreur fetch en queue (probablement CORS) pour ${url} : ${error}`);
          resolve(buildFallbackResponse(url));
        });
    }
  }
};

// Appelée quand tuelloRecords devient disponible
const onTuelloRecordsReady = (): void => {
  if (tuelloRecordsReady) return; // Déjà traité

  tuelloRecordsReady = true;

  // Traiter les queues
  processPendingMockXhrQueue();
  processPendingMockFetchQueue();
};

const createMockedResponse = (originalResponse: Response, record: TuelloRecord): Response => {
  const status = normalizeHttpStatus(record.httpCode);
  // 204 / 205 / 304 : la spec Fetch interdit un corps, new Response(body, { status })
  // lèverait un TypeError et le mock ne serait jamais servi.
  const isBodyless = BODYLESS_STATUS.has(status);
  const body = isBodyless ? '' : serializeMockBody(record.response);

  // Créer les headers avec des valeurs par défaut
  const headers = new Headers();

  // Ajouter les headers de base par défaut (sans objet, pas de corps à décrire)
  if (!isBodyless) {
    headers.set('Content-Type', 'application/json');
    headers.set('Content-Length', new TextEncoder().encode(body).length.toString());
  }

  // Ajouter les headers enregistrés du record (ils écrasent les valeurs par défaut)
  if (record.headers) {
    Object.entries(record.headers).forEach(([key, value]) => {
      if (TRANSPORT_HEADERS.has(key.toLowerCase())) return;
      try {
        headers.set(key, value);
      } catch {
        // Nom ou valeur de header invalide dans le record : on l'ignore plutôt
        // que de faire échouer la construction de toute la réponse mockée.
        logData(`- Mock HTTP - Header ignoré (invalide) : ${key}`);
      }
    });
  }

  const init: ResponseInit = { headers, status, statusText: getStatusText(status) };

  if (isBodyless) {
    return new Response(null, init);
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    }
  });

  return new Response(stream, init);
};

// ============================================================================
// Classes Intercepteur
// ============================================================================

type InterceptorName = (typeof INTERCEPTOR_NAMES)[keyof typeof INTERCEPTOR_NAMES];

class Interceptor {
  name: InterceptorName;
  isActive = false;
  userActivation = false;

  constructor(name: InterceptorName) {
    this.name = name;
  }

  interceptXHR(_req: ExtendedXMLHttpRequest): void {
    // Implémentation par défaut vide, surchargée par les instances
  }

  interceptFetch(response: Response, ..._args: unknown[]): Response | Promise<Response> {
    return response;
  }
}

class InterceptorManager {
  private interceptors: Map<InterceptorName, Interceptor> = new Map();

  addInterceptor(interceptor: Interceptor): void {
    this.interceptors.set(interceptor.name, interceptor);
  }

  getInterceptor(name: InterceptorName): Interceptor | undefined {
    return this.interceptors.get(name);
  }

  activateInterceptor(name: InterceptorName): void {
    const interceptor = this.interceptors.get(name);
    if (interceptor) {
      interceptor.isActive = true;
    }
  }

  activateInterceptorByUser(name: InterceptorName): void {
    const interceptor = this.interceptors.get(name);
    if (interceptor) {
      interceptor.isActive = true;
      interceptor.userActivation = true;
    }
  }

  deactivateInterceptor(name: InterceptorName): void {
    const interceptor = this.interceptors.get(name);
    if (interceptor) {
      interceptor.isActive = false;
      interceptor.userActivation = false;
    }
  }

  runInterceptorsXHR(req: ExtendedXMLHttpRequest): void {
    for (const interceptor of this.interceptors.values()) {
      if (interceptor.isActive) {
        interceptor.interceptXHR(req);
      }
    }
  }

  async runInterceptorsFetch(response: Response, ...args: unknown[]): Promise<Response> {
    let modifiedResponse = response;
    for (const interceptor of this.interceptors.values()) {
      if (interceptor.isActive) {
        modifiedResponse = await interceptor.interceptFetch(modifiedResponse, ...args);
      }
    }
    return modifiedResponse;
  }
}

// ============================================================================
// Instance du gestionnaire
// ============================================================================

const manager = new InterceptorManager();

// ============================================================================
// Surcharge XMLHttpRequest
// ============================================================================

XMLHttpRequest.prototype.open = function (this: ExtendedXMLHttpRequest, method: string, url: string | URL, ...args: unknown[]): void {
  this.interceptorManager = manager;
  this.originalURL = url.toString();
  this.xhrMethod = method;
  return originalOpen.call(this, method, url, ...(args as [boolean?, string?, string?]));
};

XMLHttpRequest.prototype.send = function (this: ExtendedXMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
  const url = this.originalURL || '';
  this.xhrBody = body;

  // Si le mode mock est activé
  if (mockUserActivated) {
    // Si les records ne sont pas encore prêts, on met en queue
    if (!tuelloRecordsReady) {
      logData(`- Mock HTTP - Attente des records avant envoi XHR : ${url}`);
      pendingMockXhrQueue.push({
        xhr: this,
        originalCallback: this.onreadystatechange,
        body
      });
      return;
    }

    // Records prêts, chercher le mock
    const record = findMockRecord(url, this.xhrMethod);
    if (record) {
      // Mock trouvé - intercepter la requête
      logData(`- Mock HTTP (XHR) - Mock trouvé pour : ${url}`);
      applyMockToXhr(this, record, url);
      return; // Ne pas envoyer la requête réelle
    }

    // Pas de mock trouvé - on laisse passer la requête normalement
    logData(`- Mock HTTP (XHR) - Pas de mock pour : ${url}, requête normale`);
  }

  // Comportement normal (mock non activé ou pas de mock trouvé)
  this.interceptorManager?.runInterceptorsXHR(this);

  // Capturer les erreurs CORS sur XHR pour retourner une 404.
  // Uniquement quand le mock est actif : hors de ce mode Tuello ne doit pas
  // réécrire le statut d'une erreur réseau réelle de l'application.
  // { once: true } évite l'accumulation de listeners si le XHR est réutilisé
  if (mockUserActivated) {
    this.addEventListener(
      'error',
      () => {
        logData(`- Tuello HTTP - Erreur XHR (probablement CORS) pour ${url}`);
        Object.defineProperty(this, 'status', { writable: true, value: 404 });
        Object.defineProperty(this, 'statusText', { writable: true, value: 'Not Found' });
      },
      { once: true }
    );
  }

  return originalSend.call(this, body);
};

// ============================================================================
// Surcharge Fetch
// ============================================================================

window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  const input = args[0];
  const url = extractFetchUrl(input);
  const method = extractFetchMethod(args);

  if (mockUserActivated) {
    // Si les records ne sont pas prêts, on crée une promesse qui attend
    if (!tuelloRecordsReady) {
      logData(`- Mock HTTP - Fetch en attente (records non prêts): ${url}`);
      return new Promise((resolve, reject) => {
        pendingMockFetchQueue.push({
          resolve: (res) => resolve(res),
          reject: (reason) => reject(reason),
          url,
          method,
          args // Stocker les arguments pour pouvoir envoyer la requête plus tard si pas de mock
        });
      });
    }

    const record = findMockRecord(url, method);
    if (record) {
      logData('- Mock HTTP (Fetch Bypass) - Blocage CORS réussi pour ' + url);
      if (record.delay) await sleepAsync(record.delay);
      return createMockedResponse(new Response(), record);
    }
  }

  // Si on arrive ici, c'est que soit le mock est désactivé,
  // soit l'URL n'est vraiment pas dans la liste des mocks.
  try {
    const response = await originalFetch(...args);
    return manager.runInterceptorsFetch(response, ...args);
  } catch (error) {
    // Hors mode mock, Tuello doit être transparent : une erreur réseau reste une
    // erreur réseau (offline, DNS, CORS...), sinon l'application ne peut plus la
    // distinguer d'une vraie 404. Un abort doit toujours rejeter, mock ou pas.
    if (!mockUserActivated || isAbortError(error)) {
      throw error;
    }
    // Mock actif : une requête non mockée bloquée par CORS ne doit pas casser la page
    logData(`- Tuello HTTP - Erreur fetch (probablement CORS) pour ${url} : ${error}`);
    return buildFallbackResponse(url);
  }
};

// ============================================================================
// Création et configuration des intercepteurs
// ============================================================================

const intercepteurHTTPRecorder = new Interceptor(INTERCEPTOR_NAMES.HTTP_RECORDER);
const intercepteurHTTPMock = new Interceptor(INTERCEPTOR_NAMES.HTTP_MOCK);
const intercepteurHTTPTags = new Interceptor(INTERCEPTOR_NAMES.HTTP_TAGS);

manager.addInterceptor(intercepteurHTTPRecorder);
manager.addInterceptor(intercepteurHTTPMock);
manager.addInterceptor(intercepteurHTTPTags);

// --- Mock Interceptor ---
// Note : Le mocking XHR est géré entièrement dans send() et processPendingMockXhrQueue().
// L'intercepteur mock XHR n'est plus nécessaire car :
// - Si mock activé + records prêts : send() intercepte et retourne sans envoyer
// - Si mock activé + records pas prêts : send() met en queue, processPendingMockXhrQueue traite ensuite
// Seul le mock fetch intercepteur reste utile comme filet de sécurité.

intercepteurHTTPMock.interceptFetch = async function (response: Response, ...args: unknown[]): Promise<Response> {
  if (!this.isActive) return response;

  // Si l'utilisateur n'a pas activé le mock, ne rien faire
  if (!mockUserActivated) {
    return response;
  }

  const url = response.url;
  // Sans URL exploitable (réponse opaque, Response construite à la main), une
  // résolution relative pointerait vers l'URL de la page et mockerait n'importe quoi.
  if (!url) return response;

  // Si tuelloRecords n'est pas encore prêt, retourner la réponse originale
  // (la requête a déjà été faite, pas de sens de bloquer)
  if (!tuelloRecordsReady) {
    logData('- Mock HTTP - Records non prêts, retour réponse originale pour: ' + url);
    return response;
  }

  // tuelloRecords est prêt, appliquer le mock normalement
  const record = findMockRecord(url, extractFetchMethod(args as Parameters<typeof fetch>));
  if (!record) {
    logData('- Mock HTTP - Mock non trouvé de ' + url);
    return response;
  }

  if (record.delay) {
    await sleepAsync(record.delay);
  }

  logData('- Mock HTTP - Mock de ' + url);
  return createMockedResponse(response, record);
};

// --- Recorder Interceptor ---

intercepteurHTTPRecorder.interceptXHR = function (req: ExtendedXMLHttpRequest): void {
  if (!this.isActive) return;

  const self = this;

  // Utiliser addEventListener au lieu de wrapper onreadystatechange
  // pour capturer les requêtes même quand l'app utilise addEventListener
  req.addEventListener('loadend', function () {
    const url = req.responseURL;
    if (url && typeof url === 'string' && !isExcludedUrl(url)) {
      const contentType = req.getResponseHeader('Content-Type');
      if (!contentType || contentType.includes('json')) {
        try {
          const response = req.responseText ? JSON.parse(req.responseText) : '';

          // Capturer les headers de réponse (en conservant la casse originale)
          const headers: Record<string, string> = {};
          const allHeaders = req.getAllResponseHeaders();
          if (allHeaders) {
            allHeaders.split('\r\n').forEach((line) => {
              const idx = line.indexOf(': ');
              if (idx > 0) {
                headers[line.substring(0, idx)] = line.substring(idx + 2);
              }
            });
          }

          // Tenter de parser le body si c'est du JSON string
          let parsedBody: unknown = req.xhrBody;
          if (typeof req.xhrBody === 'string') {
            try {
              parsedBody = JSON.parse(req.xhrBody);
            } catch {
              // Garder le body tel quel s'il n'est pas du JSON
            }
          }

          const message: HttpMessage = {
            type: MESSAGE_TYPES.RECORD_HTTP,
            url,
            delay: 0,
            response,
            status: req.status,
            method: req.xhrMethod || '',
            body: parsedBody,
            hrefLocation: window.location.href,
            headers
          };

          if (self.userActivation) {
            sendMessage(window, message);
          } else {
            // Mettre en queue pour une éventuelle activation utilisateur
            addToQueue(message, messageForHTTPRecorderQueue);
          }
        } catch {
          logData('- Mock HTTP - Problème non bloquant de parsing de la reponse pour l url : ' + url);
        }
      }
    }
  });
};

intercepteurHTTPRecorder.interceptFetch = async function (response: Response, ...args: unknown[]): Promise<Response> {
  if (!this.isActive) return response;

  const input = args[0];
  if (!input) return response;
  // Supporte string, URL et Request (Angular HttpClient utilise des Request objects)
  const requestUrl = extractFetchUrl(input);
  if (!requestUrl) return response;

  const init = args[1] as RequestInit | undefined;
  const contentType = response.headers.get('Content-Type');
  if (contentType && !contentType.includes('json')) return response;

  let responseData: unknown;

  try {
    responseData = await response.clone().json();
  } catch {
    return response;
  }

  // Capturer les headers de réponse (en conservant la casse originale)
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // La méthode peut venir de init (fetch(url, init)) ou du Request
  const method = init?.method || (input instanceof Request ? input.method : undefined) || 'GET';

  const message: HttpMessage = {
    type: MESSAGE_TYPES.RECORD_HTTP,
    url: response.url || requestUrl,
    delay: 0,
    status: response.status,
    method,
    body: init?.body as unknown,
    hrefLocation: window.location.href,
    response: responseData,
    headers
  };

  if (this.userActivation) {
    sendMessage(window, message);
  } else {
    // Mettre en queue pour une éventuelle activation utilisateur
    addToQueue(message, messageForHTTPRecorderQueue);
  }

  return response;
};

// --- Tags Interceptor ---

intercepteurHTTPTags.interceptXHR = function (req: ExtendedXMLHttpRequest): void {
  if (!this.isActive) return;

  const self = this;

  // Utiliser addEventListener au lieu de wrapper onreadystatechange
  req.addEventListener('loadend', function () {
    const url = req.responseURL;
    if (url && typeof url === 'string' && !isExcludedUrl(url)) {
      // Lire responseText lève une InvalidStateError quand responseType vaut
      // 'blob'/'arraybuffer'/'document' : ces réponses ne nous intéressent pas.
      let response: unknown;
      try {
        response = tryParseJson(req.responseText);
      } catch {
        return;
      }

      const message: HttpMessage = {
        type: MESSAGE_TYPES.ADD_HTTP_CALL_FOR_TAGS,
        url,
        response
      };

      if (self.userActivation) {
        flushQueue(window.top, messageForHTTPTagsQueue);
        sendMessage(window.top, message);
      } else {
        addToQueue(message, messageForHTTPTagsQueue);
      }
    }
  });
};

intercepteurHTTPTags.interceptFetch = async function (response: Response): Promise<Response> {
  if (!this.isActive) return response;
  if (!response?.url || typeof response.url !== 'string') return response;

  let responseData: unknown;
  try {
    responseData = await response.clone().json();
  } catch (error) {
    responseData = error;
  }

  const message: HttpMessage = {
    type: MESSAGE_TYPES.ADD_HTTP_CALL_FOR_TAGS,
    url: response.url,
    response: responseData
  };

  if (this.userActivation) {
    flushQueue(window.top, messageForHTTPTagsQueue);
    sendMessage(window.top, message);
  } else {
    addToQueue(message, messageForHTTPTagsQueue);
  }

  return response;
};

// ============================================================================
// Gestionnaire de messages
// ============================================================================

window.addEventListener(
  'message',
  (event: MessageEvent) => {
    // Le script s'exécute dans le monde MAIN : sans ce filtre, n'importe quelle
    // iframe ou fenêtre tierce pourrait injecter ses propres mocks dans la page.
    // Seuls les messages postés par le content script de CETTE fenêtre sont acceptés.
    const source = event.source as unknown as Window | null;
    if (source !== window) return;
    if (POST_TARGET_ORIGIN !== '*' && event.origin !== POST_TARGET_ORIGIN) return;

    const { data } = event;
    if (!data?.type) return;

    switch (data.type) {
      case MESSAGE_TYPES.MOCK_HTTP_ACTIVATED:
        if (data.value) {
          deepMockLevel = data.deepMockLevel || 0;
          try {
            window.tuelloRecords = typeof data.tuelloRecords === 'string' ? JSON.parse(data.tuelloRecords) : data.tuelloRecords || [];
          } catch (e) {
            console.error('Tuello: tuelloRecords malformé dans MOCK_HTTP_ACTIVATED', e);
            window.tuelloRecords = [];
          }

          // Construire l'index pour recherche optimisée. Toujours reconstruire, même
          // pour une liste vide : sinon l'index précédent resterait actif et des mocks
          // supprimés continueraient d'être servis.
          buildMockIndex(Array.isArray(window.tuelloRecords) ? window.tuelloRecords : []);

          // Marquer que l'utilisateur a activé le mock
          mockUserActivated = true;
          manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);

          // Débloquer les requêtes en attente sans condition sur le nombre de records :
          // une liste de mocks vide est un état valide, et laisser tuelloRecordsReady
          // à false gèlerait définitivement tous les XHR/fetch de la page.
          onTuelloRecordsReady();
        } else {
          mockUserActivated = false;
          manager.deactivateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);

          // Drainer les queues plutôt que de les abandonner : les promesses fetch
          // seraient jamais résolues et les XHR jamais envoyés -> blocage de l'app.
          const drainedXhr = pendingMockXhrQueue;
          const drainedFetch = pendingMockFetchQueue;
          pendingMockXhrQueue = [];
          pendingMockFetchQueue = [];

          for (const pending of drainedXhr) {
            const { xhr, originalCallback, body } = pending;
            if (originalCallback) xhr.onreadystatechange = originalCallback;
            xhr.interceptorManager?.runInterceptorsXHR(xhr);
            try {
              originalSend.call(xhr, body);
            } catch (e) {
              logData(`- Mock HTTP - Erreur en envoyant XHR drainé: ${e}`);
            }
          }

          for (const pending of drainedFetch) {
            const { resolve, reject, url: pendingUrl, args: pendingArgs } = pending;
            originalFetch(...pendingArgs)
              .then((response) => manager.runInterceptorsFetch(response, ...pendingArgs))
              .then(resolve)
              .catch((error) => {
                if (isAbortError(error)) {
                  reject(error);
                  return;
                }
                logData(`- Mock HTTP - Erreur fetch drainé pour ${pendingUrl}: ${error}`);
                resolve(buildFallbackResponse(pendingUrl));
              });
          }

          mockIndexExact.clear();
          mockIndexSuffix.clear();
          mockWildcardRecords = [];
          mockSearchCache.clear();
          mockIndexBuilt = false;
        }
        break;

      case MESSAGE_TYPES.RECORD_HTTP_ACTIVATED:
        if (data.value) {
          // Ne flusher la queue que si c'est une activation utilisateur (pas une restauration au chargement)
          if (!data.isRestore) {
            flushQueue(window, messageForHTTPRecorderQueue);
          } else {
            // Vider la queue sans envoyer les messages (restauration depuis le storage)
            messageForHTTPRecorderQueue = [];
          }
          manager.activateInterceptorByUser(INTERCEPTOR_NAMES.HTTP_RECORDER);
        } else {
          manager.deactivateInterceptor(INTERCEPTOR_NAMES.HTTP_RECORDER);
          messageForHTTPRecorderQueue = [];
        }
        break;

      case MESSAGE_TYPES.RECORD_HTTP_CALL_FOR_TAGS:
        if (data.value) {
          flushQueue(window.top, messageForHTTPTagsQueue);
          manager.activateInterceptorByUser(INTERCEPTOR_NAMES.HTTP_TAGS);
        } else {
          manager.deactivateInterceptor(INTERCEPTOR_NAMES.HTTP_TAGS);
          messageForHTTPTagsQueue = [];
        }
        break;

      case MESSAGE_TYPES.MOCK_HTTP_TUELLO_RECORDS:
        deepMockLevel = data.deepMockLevel || 0;
        try {
          window.tuelloRecords = typeof data.tuelloRecords === 'string' ? JSON.parse(data.tuelloRecords) : data.tuelloRecords || [];
        } catch (e) {
          console.error('Tuello: tuelloRecords malformé dans MOCK_HTTP_TUELLO_RECORDS', e);
          window.tuelloRecords = [];
        }

        // Reconstruire l'index même pour une liste vide, sinon les mocks supprimés
        // resteraient servis depuis l'index précédent.
        buildMockIndex(Array.isArray(window.tuelloRecords) ? window.tuelloRecords : []);

        // Débloquer les requêtes en attente : une liste vide est un état valide
        onTuelloRecordsReady();
        break;
    }
  },
  false
);

// ============================================================================
// Initialisation
// ============================================================================

manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_RECORDER);
manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_TAGS);
manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK); // Activer le mock dès le départ pour capturer les premières requêtes
