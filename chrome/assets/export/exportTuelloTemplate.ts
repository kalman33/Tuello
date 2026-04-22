({
  tuello: function () {
    let deepMockLevel = 2; //'###IMPORT_DEEPMOCKLEVEL###';
    window['tuelloRecords'] = '###IMPORT_DATA###';

    // ============================================================================
    // Types
    // ============================================================================

    interface TuelloRecord {
      key: string;
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

    // ============================================================================
    // Index optimisé pour recherche rapide
    // ============================================================================

    const mockIndexExact: Map<string, TuelloRecord> = new Map();
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
          headers[key.toLowerCase()] = value;
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
          mockIndexExact.set(normalized, record);
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
    // Comparaison avec support suffixe et wildcards (fallback)
    // ============================================================================

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

      if (segments1.length < segments2.length) {
        const mockSuffix = segments2.slice(-segments1.length);
        return segments1.every((seg, i) => {
          const mockSeg = mockSuffix[i];
          if (mockSeg.includes('*')) {
            return getCachedRegex(mockSeg).test(seg);
          }
          return seg === mockSeg;
        });
      }

      return false;
    };

    // ============================================================================
    // Recherche optimisée d'un mock
    // ============================================================================

    const findMockRecordOptimized = (url: string): TuelloRecord | undefined => {
      const { normalized, segments } = normalizeUrlForIndex(url);
      const cacheKey = normalized;

      if (mockSearchCache.has(cacheKey)) {
        const cached = mockSearchCache.get(cacheKey);
        return cached ?? undefined;
      }

      const exactMatch = mockIndexExact.get(normalized);
      if (exactMatch) {
        addToCache(cacheKey, exactMatch);
        return exactMatch;
      }

      for (let i = Math.min(3, segments.length); i >= 1; i--) {
        const suffixKey = getSuffixKey(segments, i);
        const candidates = mockIndexSuffix.get(suffixKey);

        if (candidates) {
          for (const candidate of candidates) {
            if (candidate.segments.length > segments.length) {
              const mockSuffix = candidate.segments.slice(-segments.length);
              const isMatch = segments.every((seg, idx) => {
                const mockSeg = mockSuffix[idx];
                if (mockSeg.includes('*')) {
                  return getCachedRegex(mockSeg).test(seg);
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

      for (const wildcardRecord of mockWildcardRecords) {
        if (getCachedRegex(wildcardRecord.normalizedKey).test(normalized)) {
          addToCache(cacheKey, wildcardRecord.record);
          return wildcardRecord.record;
        }
      }

      addToCache(cacheKey, null);
      return undefined;
    };

    const findMockRecord = (url: string): TuelloRecord | undefined => {
      const records = window['tuelloRecords'] as TuelloRecord[] | string | undefined;
      if (!records || typeof records === 'string') return undefined;

      if (mockIndexExact.size > 0 || mockWildcardRecords.length > 0) {
        return findMockRecordOptimized(url);
      }

      return records.find(({ key }) => compareWithMockLevel(url, key));
    };

    // ============================================================================
    // Construction de la Response mockée (fetch)
    // ============================================================================

    const createMockedResponse = (record: TuelloRecord): Response => {
      const body = JSON.stringify(record.response);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        }
      });

      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('Content-Length', new TextEncoder().encode(body).length.toString());

      if (record.headers) {
        Object.entries(record.headers).forEach(([key, value]) => {
          headers.set(key, value);
        });
      }

      return new Response(stream, {
        headers,
        status: record.httpCode,
        statusText: getStatusText(record.httpCode)
      });
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
      const record = findMockRecord(url);

      if (record) {
        const responseBody = JSON.stringify(record.response);
        Object.defineProperty(this, 'readyState', { writable: true, value: XMLHttpRequest.DONE });
        Object.defineProperty(this, 'status', { writable: true, value: record.httpCode });
        Object.defineProperty(this, 'statusText', { writable: true, value: getStatusText(record.httpCode) });
        Object.defineProperty(this, 'responseText', { writable: true, value: responseBody });
        Object.defineProperty(this, 'response', { writable: true, value: cloneMockResponse(record.response) });
        Object.defineProperty(this, 'responseURL', { writable: true, value: url });

        const mockHeaders = buildMockHeaders(responseBody, record.headers);

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

      return originalSend.call(this, body);
    };

    // ============================================================================
    // Surcharge Fetch
    // ============================================================================

    (window as any).fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const url = extractFetchUrl(args[0]);
      const record = findMockRecord(url);

      if (record) {
        if (record.delay) {
          await new Promise((resolve) => setTimeout(resolve, record.delay));
        }
        return createMockedResponse(record);
      }

      try {
        return await originalFetch(...args);
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Request failed (CORS)', url }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' }
        });
      }
    };
  }
})['tuello']();
