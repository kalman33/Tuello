import { logData } from './utils/utils';

// ============================================================================
// Types et Interfaces
// ============================================================================

interface TuelloRecord {
  key: string;
  response: unknown;
  httpCode: number;
  delay?: number;
}

interface CustomHeader {
  name: string;
  value: string;
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
}

interface ExtendedXMLHttpRequest extends XMLHttpRequest {
  originalURL?: string;
  xhrMethod?: string;
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

const EXCLUDED_URL_PATTERNS = ['tuello', 'sockjs'] as const;
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
let customHeaders: CustomHeader[] = [];

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
  url: string;
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

// Index pour recherche rapide O(1)
let mockIndexExact: Map<string, TuelloRecord> = new Map();
// Index par suffixe (derniers 3 segments) pour comparaison par suffixe
let mockIndexSuffix: Map<string, NormalizedRecord[]> = new Map();
// Liste des mocks avec wildcards (doivent être testés par regex)
let mockWildcardRecords: NormalizedRecord[] = [];
// Cache LRU des recherches récentes
const CACHE_MAX_SIZE = 500;
let mockSearchCache: Map<string, TuelloRecord | null> = new Map();
let mockSearchCacheOrder: string[] = [];
// Version de l'index pour invalider le cache
let mockIndexVersion = 0;

// ============================================================================
// Utilitaires
// ============================================================================

const isExcludedUrl = (url: string): boolean => EXCLUDED_URL_PATTERNS.some((pattern) => url.includes(pattern));

const sleepSync = (ms: number): void => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    /* busy wait */
  }
};

const sendMessage = (targetWindow: Window | null, message: HttpMessage): void => {
  targetWindow?.postMessage(message, '*');
};

const addToQueue = (message: HttpMessage, queue: HttpMessage[]): void => {
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
  // D'abord résoudre les URLs relatives
  const resolvedUrl = resolveRelativeUrl(url);
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
  mockSearchCacheOrder = [];
  mockIndexVersion++;

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
      // Les wildcards doivent être testés par regex
      mockWildcardRecords.push(normalizedRecord);
    } else {
      // Index exact pour recherche O(1)
      mockIndexExact.set(normalized, record);
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
 * Ajoute un résultat au cache LRU
 */
const addToCache = (key: string, result: TuelloRecord | null): void => {
  if (mockSearchCache.has(key)) {
    // Déplacer en fin de liste (plus récent)
    const idx = mockSearchCacheOrder.indexOf(key);
    if (idx > -1) {
      mockSearchCacheOrder.splice(idx, 1);
    }
  } else if (mockSearchCacheOrder.length >= CACHE_MAX_SIZE) {
    // Supprimer le plus ancien
    const oldest = mockSearchCacheOrder.shift();
    if (oldest) {
      mockSearchCache.delete(oldest);
    }
  }

  mockSearchCache.set(key, result);
  mockSearchCacheOrder.push(key);
};

/**
 * Recherche optimisée d'un mock pour une URL
 */
const findMockRecordOptimized = (url: string): TuelloRecord | undefined => {
  const { normalized, segments } = normalizeUrlForIndex(url);
  const cacheKey = `${mockIndexVersion}:${normalized}`;

  // 1. Vérifier le cache
  if (mockSearchCache.has(cacheKey)) {
    const cached = mockSearchCache.get(cacheKey);
    return cached ?? undefined;
  }

  // 2. Recherche exacte O(1)
  const exactMatch = mockIndexExact.get(normalized);
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
      for (const candidate of candidates) {
        // Vérifier si c'est un match par suffixe
        if (candidate.segments.length > segments.length) {
          const mockSuffix = candidate.segments.slice(-segments.length);
          const isMatch = segments.every((seg, idx) => {
            const mockSeg = mockSuffix[idx];
            if (mockSeg.includes('*')) {
              const pattern = mockSeg.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');
              return new RegExp(`^${pattern}$`).test(seg);
            }
            return seg === mockSeg;
          });

          if (isMatch) {
            addToCache(cacheKey, candidate.record);
            return candidate.record;
          }
        }
      }
    }
  }

  // 4. Vérifier les wildcards (plus lent, mais nécessaire)
  for (const wildcardRecord of mockWildcardRecords) {
    const escapedPattern = wildcardRecord.normalizedKey.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');

    if (new RegExp(`^${escapedPattern}$`).test(normalized)) {
      addToCache(cacheKey, wildcardRecord.record);
      return wildcardRecord.record;
    }

    // Vérifier aussi par suffixe pour les wildcards
    if (wildcardRecord.segments.length > segments.length) {
      const mockSuffix = wildcardRecord.segments.slice(-segments.length);
      const isMatch = segments.every((seg, idx) => {
        const mockSeg = mockSuffix[idx];
        if (mockSeg.includes('*')) {
          const pattern = mockSeg.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');
          return new RegExp(`^${pattern}$`).test(seg);
        }
        return seg === mockSeg;
      });

      if (isMatch) {
        addToCache(cacheKey, wildcardRecord.record);
        return wildcardRecord.record;
      }
    }
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
  const escapedUrl2 = normalizedUrl2.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');

  if (new RegExp(`^${escapedUrl2}$`).test(normalizedUrl1)) {
    return true;
  }

  // Comparaison par suffixe : l'URL actuelle peut avoir moins de segments (contextRoot manquant)
  // Ex: mock = "global/text1/text2/text3", actuel = "text1/text2/text3" → match
  const segments1 = normalizedUrl1.split('/').filter((s) => s);
  const segments2 = normalizedUrl2.split('/').filter((s) => s);

  // Si l'URL actuelle a moins de segments que le mock, vérifier si c'est un suffixe
  if (segments1.length < segments2.length) {
    const mockSuffix = segments2.slice(-segments1.length);
    return segments1.every((seg, i) => {
      const mockSeg = mockSuffix[i];
      // Support des wildcards dans le segment du mock
      if (mockSeg.includes('*')) {
        const pattern = mockSeg.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(seg);
      }
      return seg === mockSeg;
    });
  }

  return false;
};

const findMockRecord = (url: string): TuelloRecord | undefined => {
  const records = window.tuelloRecords;
  if (!records || typeof records === 'string') return undefined;

  // Utiliser la recherche optimisée si l'index est disponible
  if (mockIndexExact.size > 0 || mockWildcardRecords.length > 0) {
    return findMockRecordOptimized(url);
  }

  // Fallback sur la recherche linéaire si l'index n'est pas construit
  return records.find(({ key }: TuelloRecord) => compareWithMockLevel(url, key));
};

// Traite la queue des XHR en attente de mock
const processPendingMockXhrQueue = (): void => {
  logData(`- Mock HTTP - Traitement de ${pendingMockXhrQueue.length} requêtes XHR en attente`);

  while (pendingMockXhrQueue.length > 0) {
    const pending = pendingMockXhrQueue.shift();
    if (!pending) continue;

    const { xhr, originalCallback, body } = pending;
    const url = xhr.originalURL || '';
    const record = findMockRecord(url);

    if (record) {
      if (record.delay) {
        sleepSync(record.delay);
      }

      const responseBody = JSON.stringify(record.response);
      Object.defineProperty(xhr, 'readyState', { writable: true, value: XMLHttpRequest.DONE });
      Object.defineProperty(xhr, 'status', { writable: true, value: record.httpCode });
      Object.defineProperty(xhr, 'responseText', { writable: true, value: responseBody });
      Object.defineProperty(xhr, 'response', { writable: true, value: record.response });

      // Ajouter les headers par défaut + custom headers
      const mockHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'content-length': new TextEncoder().encode(responseBody).length.toString()
      };

      customHeaders.forEach((h) => {
        if (h.name && h.value) {
          mockHeaders[h.name.toLowerCase()] = h.value;
        }
      });

      xhr.getResponseHeader = (name: string) => mockHeaders[name.toLowerCase()] || null;
      xhr.getAllResponseHeaders = () =>
        Object.entries(mockHeaders)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n');

      logData('- Mock HTTP - Mock de ' + url);

      if (originalCallback) {
        originalCallback.call(xhr, new Event('readystatechange'));
      }
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

    const { resolve, url, args } = pending;
    const record = findMockRecord(url);

    if (record) {
      if (record.delay) {
        sleepSync(record.delay);
      }
      logData('- Mock HTTP - Mock de ' + url);
      resolve(createMockedResponse(new Response(), record));
    } else {
      // Pas de mock trouvé - laisser passer la requête normalement
      logData('- Mock HTTP - Pas de mock pour ' + url + ' - Requête envoyée normalement');
      originalFetch(...args)
        .then((response) => manager.runInterceptorsFetch(response, ...args))
        .then(resolve)
        .catch(() => {
          // En cas d'erreur (ex: CORS), retourner une réponse d'erreur
          resolve(
            new Response(JSON.stringify({ error: 'Fetch failed', url }), {
              status: 0,
              statusText: 'Network Error',
              headers: { 'Content-Type': 'application/json' }
            })
          );
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
  const body = JSON.stringify(record.response);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    }
  });

  // Créer les headers avec des valeurs par défaut + custom headers
  const headers = new Headers();

  // Ajouter les headers de base par défaut
  headers.set('Content-Type', 'application/json');
  headers.set('Content-Length', new TextEncoder().encode(body).length.toString());

  // Copier les headers de la réponse originale s'il y en a
  originalResponse.headers.forEach((value, key) => {
    headers.set(key, value);
  });

  // Ajouter les custom headers (ils écrasent les valeurs existantes si même nom)
  customHeaders.forEach((header) => {
    if (header.name && header.value) {
      headers.set(header.name, header.value);
    }
  });

  return new Response(stream, {
    headers,
    status: record.httpCode,
    statusText: record.httpCode === 200 ? 'OK' : 'Not Found'
  });
};

const modifyXhrResponse = (xhr: ExtendedXMLHttpRequest, applyDelay: boolean = false): void => {
  const record = findMockRecord(xhr.originalURL || '');
  if (!record) {
    logData('- Mock HTTP - Mock non trouvé de ' + xhr.originalURL);
    return;
  }

  if (record.delay && applyDelay) {
    sleepSync(record.delay);
  }

  Object.defineProperty(xhr, 'response', { writable: true });
  Object.defineProperty(xhr, 'responseText', { writable: true });
  Object.defineProperty(xhr, 'status', { writable: true });

  (xhr as any).responseText = JSON.stringify(record.response);
  (xhr as any).response = record.response;
  (xhr as any).status = record.httpCode;

  logData('- Mock HTTP - Mock de ' + xhr.originalURL);
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
    const record = findMockRecord(url);
    if (record) {
      // Mock trouvé - intercepter la requête
      logData(`- Mock HTTP (XHR) - Mock trouvé pour : ${url}`);

      if (record.delay) sleepSync(record.delay);

      Object.defineProperty(this, 'readyState', { writable: true, value: XMLHttpRequest.DONE });
      Object.defineProperty(this, 'status', { writable: true, value: record.httpCode });
      Object.defineProperty(this, 'responseText', { writable: true, value: JSON.stringify(record.response) });
      Object.defineProperty(this, 'response', { writable: true, value: record.response });

      // Simuler les headers
      const responseBody = JSON.stringify(record.response);
      const mockHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'content-length': new TextEncoder().encode(responseBody).length.toString()
      };

      // Ajouter les custom headers
      customHeaders.forEach((h) => {
        if (h.name && h.value) {
          mockHeaders[h.name.toLowerCase()] = h.value;
        }
      });

      this.getResponseHeader = (name: string) => mockHeaders[name.toLowerCase()] || null;
      this.getAllResponseHeaders = () =>
        Object.entries(mockHeaders)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\r\n');

      setTimeout(() => {
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new Event('load'));
        this.dispatchEvent(new Event('loadend'));
      }, 0);
      return; // Ne pas envoyer la requête réelle
    }

    // Pas de mock trouvé - on laisse passer la requête normalement
    logData(`- Mock HTTP (XHR) - Pas de mock pour : ${url}, requête normale`);
  }

  // Comportement normal (mock non activé ou pas de mock trouvé)
  this.interceptorManager?.runInterceptorsXHR(this);
  return originalSend.call(this, body);
};

// ============================================================================
// Surcharge Fetch
// ============================================================================

window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  const input = args[0];
  const url = typeof input === 'string' ? input : (input as Request).url;

  if (mockUserActivated) {
    // Si les records ne sont pas prêts, on crée une promesse qui attend
    if (!tuelloRecordsReady) {
      logData(`- Mock HTTP - Fetch en attente (records non prêts): ${url}`);
      return new Promise((resolve) => {
        pendingMockFetchQueue.push({
          resolve: (res) => resolve(res),
          url,
          args // Stocker les arguments pour pouvoir envoyer la requête plus tard si pas de mock
        });
      });
    }

    const record = findMockRecord(url);
    if (record) {
      logData('- Mock HTTP (Fetch Bypass) - Blocage CORS réussi pour ' + url);
      if (record.delay) sleepSync(record.delay);
      return createMockedResponse(new Response(), record);
    }
  }

  // Si on arrive ici, c'est que soit le mock est désactivé,
  // soit l'URL n'est vraiment pas dans la liste des mocks.
  const response = await originalFetch(...args);
  return manager.runInterceptorsFetch(response, ...args);
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

intercepteurHTTPMock.interceptXHR = function (req: ExtendedXMLHttpRequest): void {
  if (!this.isActive) return;

  const originalOnReadyStateChange = req.onreadystatechange;

  req.onreadystatechange = function (this: XMLHttpRequest, ev: Event) {
    if (this.readyState === XMLHttpRequest.DONE) {
      // Si l'utilisateur n'a pas activé le mock, ne rien faire
      if (!mockUserActivated) {
        originalOnReadyStateChange?.call(this, ev);
        return;
      }

      // Si tuelloRecords n'est pas encore prêt, mettre en queue
      if (!tuelloRecordsReady) {
        pendingMockXhrQueue.push({
          xhr: req,
          originalCallback: originalOnReadyStateChange
        });
        logData('- Mock HTTP - Requête XHR mise en queue (tuelloRecords non prêt): ' + req.originalURL);
        // Ne pas appeler le callback original maintenant, il sera appelé après le mock
        return;
      }

      // tuelloRecords est prêt, appliquer le mock normalement
      modifyXhrResponse(req, false);
    }
    originalOnReadyStateChange?.call(this, ev);
  };
};

intercepteurHTTPMock.interceptFetch = function (response: Response): Response | Promise<Response> {
  if (!this.isActive) return response;

  // Si l'utilisateur n'a pas activé le mock, ne rien faire
  if (!mockUserActivated) {
    return response;
  }

  const url = response.url;

  // Si tuelloRecords n'est pas encore prêt, retourner la réponse originale
  // (la requête a déjà été faite, pas de sens de bloquer)
  if (!tuelloRecordsReady) {
    logData('- Mock HTTP - Records non prêts, retour réponse originale pour: ' + url);
    return response;
  }

  // tuelloRecords est prêt, appliquer le mock normalement
  const record = findMockRecord(url);
  if (!record) {
    logData('- Mock HTTP - Mock non trouvé de ' + url);
    return response;
  }

  if (record.delay) {
    sleepSync(record.delay);
  }

  logData('- Mock HTTP - Mock de ' + url);
  return createMockedResponse(response, record);
};

// --- Recorder Interceptor ---

intercepteurHTTPRecorder.interceptXHR = function (req: ExtendedXMLHttpRequest): void {
  if (!this.isActive) return;

  const self = this;
  const originalOnReadyStateChange = req.onreadystatechange;

  req.onreadystatechange = function (this: XMLHttpRequest, ev: Event) {
    if (this.readyState === XMLHttpRequest.DONE) {
      const url = req.responseURL;
      if (url && typeof url === 'string' && !isExcludedUrl(url)) {
        const contentType = req.getResponseHeader('Content-Type');
        if (!contentType || contentType.includes('json')) {
          try {
            const response = req.responseText ? JSON.parse(req.responseText) : '';
            const message: HttpMessage = {
              type: MESSAGE_TYPES.RECORD_HTTP,
              url,
              delay: 0,
              response,
              status: req.status,
              method: req.xhrMethod || '',
              hrefLocation: window.location.href
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
    }
    originalOnReadyStateChange?.call(this, ev);
  };
};

intercepteurHTTPRecorder.interceptFetch = async function (response: Response, ...args: unknown[]): Promise<Response> {
  if (!this.isActive) return response;

  const input = args[0];
  if (!input || typeof input !== 'string') return response;

  const init = args[1] as RequestInit | undefined;
  let responseData: unknown;

  try {
    responseData = await response.clone().json();
  } catch (error) {
    responseData = error;
  }

  const message: HttpMessage = {
    type: MESSAGE_TYPES.RECORD_HTTP,
    url: response.url,
    delay: 0,
    status: response.status,
    method: init?.method || 'GET',
    body: init?.body as unknown,
    hrefLocation: window.location.href,
    response: responseData
  };

  const serializedMessage = JSON.parse(JSON.stringify(message));

  if (this.userActivation) {
    sendMessage(window, serializedMessage);
  } else {
    // Mettre en queue pour une éventuelle activation utilisateur
    addToQueue(serializedMessage, messageForHTTPRecorderQueue);
  }

  return response;
};

// --- Tags Interceptor ---

intercepteurHTTPTags.interceptXHR = function (req: ExtendedXMLHttpRequest): void {
  if (!this.isActive) return;

  const self = this;
  const originalOnReadyStateChange = req.onreadystatechange;

  req.onreadystatechange = function (this: XMLHttpRequest, ev: Event) {
    if (this.readyState === XMLHttpRequest.DONE) {
      const url = req.responseURL;
      if (url && typeof url === 'string' && !isExcludedUrl(url)) {
        const response = tryParseJson(req.responseText);
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
    }
    originalOnReadyStateChange?.call(this, ev);
  };
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

  const serializedMessage = JSON.parse(JSON.stringify(message));

  if (this.userActivation) {
    flushQueue(window.top, messageForHTTPTagsQueue);
    sendMessage(window.top, serializedMessage);
  } else {
    addToQueue(serializedMessage, messageForHTTPTagsQueue);
  }

  return response;
};

// ============================================================================
// Gestionnaire de messages
// ============================================================================

window.addEventListener(
  'message',
  (event: MessageEvent) => {
    const { data } = event;
    if (!data?.type) return;

    switch (data.type) {
      case MESSAGE_TYPES.MOCK_HTTP_ACTIVATED:
        if (data.value) {
          deepMockLevel = data.deepMockLevel || 0;
          customHeaders = Array.isArray(data.customHeaders) ? data.customHeaders : [];
          window.tuelloRecords = typeof data.tuelloRecords === 'string' ? JSON.parse(data.tuelloRecords) : data.tuelloRecords || [];

          // Construire l'index pour recherche optimisée
          if (Array.isArray(window.tuelloRecords) && window.tuelloRecords.length > 0) {
            buildMockIndex(window.tuelloRecords);
          }

          // Marquer que l'utilisateur a activé le mock
          mockUserActivated = true;
          manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);

          // Si on a des records, traiter les requêtes en attente
          if (window.tuelloRecords && window.tuelloRecords.length > 0) {
            onTuelloRecordsReady();
          }
        } else {
          mockUserActivated = false;
          customHeaders = [];
          manager.deactivateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);
          // Vider les queues et l'index si le mock est désactivé
          pendingMockXhrQueue = [];
          pendingMockFetchQueue = [];
          mockIndexExact.clear();
          mockIndexSuffix.clear();
          mockWildcardRecords = [];
          mockSearchCache.clear();
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
        customHeaders = Array.isArray(data.customHeaders) ? data.customHeaders : [];
        window.tuelloRecords = typeof data.tuelloRecords === 'string' ? JSON.parse(data.tuelloRecords) : data.tuelloRecords || [];

        // Construire l'index pour recherche optimisée
        if (Array.isArray(window.tuelloRecords) && window.tuelloRecords.length > 0) {
          buildMockIndex(window.tuelloRecords);
        }

        // Si on a des records et que le mock est activé, traiter les requêtes en attente
        if (window.tuelloRecords && window.tuelloRecords.length > 0) {
          onTuelloRecordsReady();
        }
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
