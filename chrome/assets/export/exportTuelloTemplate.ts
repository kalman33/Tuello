({
  tuello: function () {
    let deepMockLevel = 2; //'###IMPORT_DEEPMOCKLEVEL###';
    // Remplace a l'export par 'true' ou 'false' : mode verbeux (logs des bouchons trouves / non trouves).
    const verboseFlag: string = '###IMPORT_VERBOSE###';
    const verbose: boolean = verboseFlag === 'true';
    window['tuelloRecords'] = '###IMPORT_DATA###';

    // ============================================================================
    // Types
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

    interface NormalizedRecord {
      record: TuelloRecord;
      normalizedKey: string;
      segments: string[];
      hasWildcard: boolean;
    }

    // ============================================================================
    // Constantes
    // ============================================================================

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

    // ============================================================================
    // Logs (mode verbeux uniquement)
    // ============================================================================

    const LOG_PREFIX = '[ TUELLO ]';
    const LOG_STYLE = 'color:#00bcd4;font-weight:bold;';

    const logVerbose = (...args: unknown[]): void => {
      if (!verbose) return;
      console.log('%c' + LOG_PREFIX, LOG_STYLE, ...args);
    };

    // ============================================================================
    // Index optimisé pour recherche rapide
    // ============================================================================

    const mockIndexExact: Map<string, NormalizedRecord[]> = new Map();
    const mockIndexSuffix: Map<string, NormalizedRecord[]> = new Map();
    let mockWildcardRecords: NormalizedRecord[] = [];
    const CACHE_MAX_SIZE = 500;
    const mockSearchCache: Map<string, TuelloRecord | null> = new Map();

    // Cache des regex compilées (évite la recompilation à chaque requête)
    const regexCache = new Map<string, RegExp>();
    const REGEX_CACHE_MAX_SIZE = 1000;

    const getCachedRegex = (pattern: string): RegExp => {
      let regex = regexCache.get(pattern);
      if (!regex) {
        if (regexCache.size >= REGEX_CACHE_MAX_SIZE) {
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

    const tryParseJson = (text: string): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };

    const getRecordContentType = (headers?: Record<string, string>): string => {
      if (!headers) return '';
      const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
      return entry ? entry[1] : '';
    };

    // À l'enregistrement, un corps non JSON (texte brut, HTML, réponse vide) est stocké tel
    // quel sous forme de chaîne. Le repasser dans JSON.stringify au rejeu l'entourait de
    // guillemets ("valeur" au lieu de valeur, '""' au lieu d'un corps vide). Une chaîne
    // n'est re-sérialisée en JSON que si la réponse d'origine était déclarée JSON.
    const isRawTextMockResponse = (record: TuelloRecord): boolean => typeof record.response === 'string' && !/json/i.test(getRecordContentType(record.headers));

    // JSON.stringify(undefined) renvoie undefined : on garantit toujours une chaîne.
    const serializeMockBody = (record: TuelloRecord): string => {
      if (isRawTextMockResponse(record)) return record.response as string;
      const serialized = JSON.stringify(record.response);
      return serialized === undefined ? '' : serialized;
    };

    // Content-Type par défaut quand le record n'en a pas enregistré.
    const defaultMockContentType = (record: TuelloRecord): string => (isRawTextMockResponse(record) ? 'text/plain' : 'application/json');

    /**
     * Construit la valeur de xhr.response en respectant responseType : la spec impose
     * une chaîne pour '' et 'text', un objet pour 'json', un Blob ou un ArrayBuffer
     * pour les types binaires.
     */
    const buildXhrResponseValue = (responseType: XMLHttpRequestResponseType, record: TuelloRecord, responseBody: string): unknown => {
      if (!responseBody) return responseType === 'json' || responseType === 'document' ? null : '';

      switch (responseType) {
        case 'json':
          // Texte brut : la spec renvoie null quand le corps n'est pas du JSON valide.
          if (isRawTextMockResponse(record)) {
            const parsed = tryParseJson(responseBody);
            return parsed === responseBody ? null : parsed;
          }
          return cloneMockResponse(record.response);
        case 'blob':
          return new Blob([responseBody], { type: defaultMockContentType(record) });
        case 'arraybuffer':
          return new TextEncoder().encode(responseBody).buffer;
        case 'document':
          return null;
        default:
          return responseBody;
      }
    };

    // Extrait l'URL d'un input fetch qui peut être une string, un URL ou un Request.
    const extractFetchUrl = (input: unknown): string => {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      if (input instanceof Request) return input.url;
      return '';
    };

    // Extrait la méthode d'un appel fetch : soit de l'init, soit du Request, sinon GET.
    const extractFetchMethod = (args: Parameters<typeof fetch>): string => {
      const init = args[1] as RequestInit | undefined;
      if (init?.method) return init.method.toUpperCase();
      const input = args[0];
      if (input instanceof Request) return input.method.toUpperCase();
      return 'GET';
    };

    // Fusionne les headers par défaut avec ceux du record en normalisant la casse
    // (sinon on peut se retrouver avec "Content-Type" et "content-type" dupliqués).
    const buildMockHeaders = (responseBody: string, recordHeaders?: Record<string, string>, defaultContentType = 'application/json'): Record<string, string> => {
      const headers: Record<string, string> = {
        'content-type': defaultContentType,
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

    const resolveRelativeUrl = (url: string): string => {
      if (url.match(/^https?:\/\//)) {
        return url;
      }
      try {
        return new URL(url, window.location.href).href;
      } catch {
        return url;
      }
    };

    const removeURLPortAndProtocol = (url: string): string => {
      const resolvedUrl = resolveRelativeUrl(url);
      try {
        const parseURL = new URL(resolvedUrl);
        return parseURL.pathname + parseURL.search + parseURL.hash;
      } catch {
        return url;
      }
    };

    const normalizeUrl = (url: string): string => {
      if (!url.includes('..')) {
        return url;
      }

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
    // Normalisation des URLs pour l'index
    // ============================================================================

    const normalizeUrlForIndex = (url: string): { normalized: string; segments: string[]; strippedPrefix: string } => {
      const fullPath = removeURLPortAndProtocol(url);
      let normalized = fullPath;

      let inc = deepMockLevel;
      while (inc > 0) {
        const parts = normalized.split('/');
        const prefix = parts.slice(0, inc).join('/');
        normalized = normalized.replace(prefix, '');
        if (normalized) break;
        inc--;
      }

      // Partie du chemin ignorée par la profondeur de comparaison (ex. "/api1" en profondeur 2)
      const strippedPrefix = fullPath.substring(0, fullPath.length - normalized.length);

      normalized = normalizeUrl(normalized.replace(/^\//, ''));
      const segments = normalized.split('/').filter((s) => s);

      return { normalized, segments, strippedPrefix };
    };

    // Paires "préfixe requête → préfixe mock" déjà signalées, pour ne pas inonder la console
    const warnedPrefixMismatches = new Set<string>();

    /**
     * Avertit (même hors mode verbeux) quand un bouchon répond à une URL dont la partie
     * ignorée par la profondeur de comparaison diffère de celle enregistrée : deux API
     * distinctes (ex. /api1/... et /api2/...) deviennent alors identiques et l'une reçoit
     * silencieusement les réponses de l'autre. Limité aux correspondances exactes après
     * profondeur : la comparaison par suffixe (contextRoot absent) n'est pas concernée.
     */
    const warnIfDepthCollision = (url: string, record: TuelloRecord): void => {
      if (deepMockLevel <= 0 || record.key.includes('*')) return;
      const request = normalizeUrlForIndex(url);
      const mock = normalizeUrlForIndex(record.key);
      if (request.normalized !== mock.normalized || request.strippedPrefix === mock.strippedPrefix) return;

      const pairKey = `${request.strippedPrefix}→${mock.strippedPrefix}`;
      if (warnedPrefixMismatches.has(pairKey)) return;
      warnedPrefixMismatches.add(pairKey);

      console.warn(
        `${LOG_PREFIX} Bouchon enregistré pour "${mock.strippedPrefix}/${mock.normalized}" servi pour "${request.strippedPrefix}/${request.normalized}" : ` +
          `la profondeur de comparaison (${deepMockLevel}) ignore "${request.strippedPrefix}" et "${mock.strippedPrefix}", ces deux URL sont donc considérées identiques. ` +
          `Si ce sont deux API différentes, diminuez la valeur de deepMockLevel en tête du fichier de la librairie.`
      );
    };

    const getSuffixKey = (segments: string[], count: number = 3): string => {
      const suffix = segments.slice(-count);
      return suffix.map((s) => (s.includes('*') ? '__WILDCARD__' : s)).join('/');
    };

    // ============================================================================
    // Construction de l'index
    // ============================================================================

    const buildMockIndex = (records: TuelloRecord[]): void => {
      mockIndexExact.clear();
      mockIndexSuffix.clear();
      mockWildcardRecords = [];
      mockSearchCache.clear();

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
          mockWildcardRecords.push(normalizedRecord);
        } else {
          // On empile au lieu d'écraser : plusieurs méthodes peuvent partager la même
          // URL, et le premier record du tableau reste prioritaire (pickByMethod).
          const exactBucket = mockIndexExact.get(normalized);
          if (exactBucket) {
            exactBucket.push(normalizedRecord);
          } else {
            mockIndexExact.set(normalized, [normalizedRecord]);
          }
        }

        for (let i = 1; i <= Math.min(3, segments.length); i++) {
          const suffixKey = getSuffixKey(segments, i);
          if (!mockIndexSuffix.has(suffixKey)) {
            mockIndexSuffix.set(suffixKey, []);
          }
          mockIndexSuffix.get(suffixKey)!.push(normalizedRecord);
        }
      }
    };

    // ============================================================================
    // Cache LRU (basé sur l'ordre d'insertion de Map, O(1))
    // ============================================================================

    const addToCache = (key: string, result: TuelloRecord | null): void => {
      if (mockSearchCache.has(key)) {
        mockSearchCache.delete(key); // Réinsérer en fin (plus récent)
      } else if (mockSearchCache.size >= CACHE_MAX_SIZE) {
        const oldest = mockSearchCache.keys().next().value;
        if (oldest !== undefined) mockSearchCache.delete(oldest);
      }
      mockSearchCache.set(key, result);
    };

    // ============================================================================
    // Méthode HTTP
    // ============================================================================

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

    // ============================================================================
    // Comparaison avec support suffixe et wildcards (fallback)
    // ============================================================================

    /**
     * Compare les segments d'un mock à ceux d'une URL plus courte (contextRoot absent
     * de la requête). Au moins un segment doit correspondre littéralement : sans cette
     * garde, un mock terminé par "/*" intercepte n'importe quelle URL d'un seul segment.
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

      if (getCachedRegex(normalizedUrl2).test(normalizedUrl1)) {
        return true;
      }

      const segments1 = normalizedUrl1.split('/').filter((s) => s);
      const segments2 = normalizedUrl2.split('/').filter((s) => s);

      return matchesBySuffix(segments2, segments1);
    };

    // ============================================================================
    // Recherche optimisée d'un mock
    // ============================================================================

    const findMockRecordOptimized = (url: string, method?: string): TuelloRecord | undefined => {
      const { normalized, segments } = normalizeUrlForIndex(url);
      // La méthode fait partie de la clé de cache : deux verbes sur la même URL
      // peuvent répondre des mocks différents.
      const cacheKey = `${(method || '').toUpperCase()}:${normalized}`;

      if (mockSearchCache.has(cacheKey)) {
        const cached = mockSearchCache.get(cacheKey);
        return cached ?? undefined;
      }

      const exactMatch = pickByMethod(mockIndexExact.get(normalized), method);
      if (exactMatch) {
        addToCache(cacheKey, exactMatch);
        return exactMatch;
      }

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

      const wildcardMatches = mockWildcardRecords.filter((wildcardRecord) => getCachedRegex(wildcardRecord.normalizedKey).test(normalized) || matchesBySuffix(wildcardRecord.segments, segments));
      const wildcardMatch = pickByMethod(wildcardMatches, method);
      if (wildcardMatch) {
        addToCache(cacheKey, wildcardMatch);
        return wildcardMatch;
      }

      addToCache(cacheKey, null);
      return undefined;
    };

    const findMockRecord = (url: string, method?: string): TuelloRecord | undefined => {
      const records = window['tuelloRecords'] as TuelloRecord[] | string | undefined;
      if (!records || typeof records === 'string') return undefined;

      if (mockIndexExact.size > 0 || mockWildcardRecords.length > 0) {
        return findMockRecordOptimized(url, method);
      }

      return records.find((record) => compareWithMockLevel(url, record.key) && methodMatches(record, method));
    };

    // ============================================================================
    // Construction de la Response mockée (fetch)
    // ============================================================================

    const createMockedResponse = (record: TuelloRecord): Response => {
      const status = normalizeHttpStatus(record.httpCode);
      // 204 / 205 / 304 : la spec Fetch interdit un corps, new Response(body, { status })
      // lèverait un TypeError et le mock ne serait jamais servi.
      const isBodyless = BODYLESS_STATUS.has(status);
      const body = isBodyless ? '' : serializeMockBody(record);

      const headers = new Headers();
      if (!isBodyless) {
        headers.set('Content-Type', defaultMockContentType(record));
        headers.set('Content-Length', new TextEncoder().encode(body).length.toString());
      }

      if (record.headers) {
        Object.entries(record.headers).forEach(([key, value]) => {
          if (TRANSPORT_HEADERS.has(key.toLowerCase())) return;
          try {
            headers.set(key, value);
          } catch {
            // Nom ou valeur de header invalide : on l'ignore plutôt que de faire
            // échouer la construction de toute la réponse mockée.
            logVerbose('Header ignoré (invalide) :', key);
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
    // Sauvegarde des méthodes originales
    // ============================================================================

    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;
    const originalFetch = window.fetch.bind(window);

    // ============================================================================
    // Initialisation de l'index au chargement
    // ============================================================================

    const initialRecords = window['tuelloRecords'] as unknown;
    if (Array.isArray(initialRecords) && initialRecords.length > 0) {
      buildMockIndex(initialRecords as TuelloRecord[]);
      logVerbose('Librairie initialisée :', initialRecords.length, 'bouchon(s) chargé(s), deepMockLevel =', deepMockLevel);
      logVerbose(
        'Bouchons disponibles :',
        (initialRecords as TuelloRecord[]).map(({ key, httpCode, delay }) => ({ key, httpCode, delay: delay || 0 }))
      );
    } else {
      logVerbose('Librairie initialisée : aucun bouchon chargé');
    }

    // ============================================================================
    // Surcharge XMLHttpRequest
    // ============================================================================

    (window as any).XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...args: any[]): void {
      this['originalURL'] = url.toString();
      this['xhrMethod'] = method;
      return originalOpen.apply(this, [method, url, ...args] as any);
    };

    (window as any).XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
      const url = this['originalURL'] || '';
      const method = this['xhrMethod'] || 'GET';
      const record = findMockRecord(url, method);

      if (record) {
        const status = normalizeHttpStatus(record.httpCode);
        warnIfDepthCollision(url, record);
        logVerbose('XHR bouchonné :', method, url, '→ clé :', record.key, '| statut :', status, '| délai :', record.delay || 0, 'ms');
        logVerbose('XHR réponse :', url, record.response);
        const responseBody = BODYLESS_STATUS.has(status) ? '' : serializeMockBody(record);
        // xhr.responseType doit être lu avant que les propriétés ne soient redéfinies
        const mockedResponse = buildXhrResponseValue(this.responseType, record, responseBody);
        Object.defineProperty(this, 'readyState', { writable: true, value: XMLHttpRequest.DONE });
        Object.defineProperty(this, 'status', { writable: true, value: status });
        Object.defineProperty(this, 'statusText', { writable: true, value: getStatusText(status) });
        Object.defineProperty(this, 'responseText', { writable: true, value: responseBody });
        Object.defineProperty(this, 'response', { writable: true, value: mockedResponse });
        Object.defineProperty(this, 'responseURL', { writable: true, value: url });

        const mockHeaders = buildMockHeaders(responseBody, record.headers, defaultMockContentType(record));

        this.getResponseHeader = (name: string) => mockHeaders[name.toLowerCase()] ?? null;
        this.getAllResponseHeaders = () =>
          Object.entries(mockHeaders)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\r\n');

        setTimeout(() => {
          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          this.dispatchEvent(new Event('loadend'));
        }, record.delay || 0);
        return;
      }

      logVerbose('XHR non bouchonné (appel réel) :', method, url);
      return originalSend.call(this, body);
    };

    // ============================================================================
    // Surcharge Fetch
    // ============================================================================

    (window as any).fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const url = extractFetchUrl(args[0]);
      const method = extractFetchMethod(args);
      const record = findMockRecord(url, method);

      if (record) {
        warnIfDepthCollision(url, record);
        logVerbose('Fetch bouchonné :', url, '→ clé :', record.key, '| statut :', normalizeHttpStatus(record.httpCode), '| délai :', record.delay || 0, 'ms');
        logVerbose('Fetch réponse :', url, record.response);
        if (record.delay) {
          await new Promise((resolve) => setTimeout(resolve, record.delay));
        }
        return createMockedResponse(record);
      }

      logVerbose('Fetch non bouchonné (appel réel) :', url);

      try {
        return await originalFetch(...args);
      } catch (error) {
        logVerbose('Fetch en erreur (CORS ?) :', url, error);
        return new Response(JSON.stringify({ error: 'Request failed (CORS)', url }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' }
        });
      }
    };
  }
})['tuello']();
