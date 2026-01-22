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
    // Index optimisé pour recherche rapide
    // ============================================================================

    // Index pour recherche exacte O(1)
    const mockIndexExact: Map<string, TuelloRecord> = new Map();
    // Index par suffixe (derniers 3 segments)
    const mockIndexSuffix: Map<string, NormalizedRecord[]> = new Map();
    // Liste des mocks avec wildcards
    let mockWildcardRecords: NormalizedRecord[] = [];
    // Cache LRU des recherches récentes
    const CACHE_MAX_SIZE = 500;
    const mockSearchCache: Map<string, TuelloRecord | null> = new Map();
    const mockSearchCacheOrder: string[] = [];

    // ============================================================================
    // Utilitaires
    // ============================================================================

    function removeURLPortAndProtocol(url: string): string {
      let ret = '';
      try {
        let parseURL = new URL(url);
        parseURL.port = '';
        ret = parseURL.toString();
        ret = ret.replace(/^https?:\/\//, '');
      } catch (e) {
        ret = url;
      }
      return ret;
    }

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

    const sleep = (ms: number): void => {
      const stop = new Date().getTime() + ms;
      while (new Date().getTime() < stop) {}
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
      mockSearchCacheOrder.length = 0;

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

        // Index par suffixe (1, 2 et 3 derniers segments)
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
    // Cache LRU
    // ============================================================================

    const addToCache = (key: string, result: TuelloRecord | null): void => {
      if (mockSearchCache.has(key)) {
        const idx = mockSearchCacheOrder.indexOf(key);
        if (idx > -1) {
          mockSearchCacheOrder.splice(idx, 1);
        }
      } else if (mockSearchCacheOrder.length >= CACHE_MAX_SIZE) {
        const oldest = mockSearchCacheOrder.shift();
        if (oldest) {
          mockSearchCache.delete(oldest);
        }
      }

      mockSearchCache.set(key, result);
      mockSearchCacheOrder.push(key);
    };

    // ============================================================================
    // Comparaison avec support suffixe et wildcards
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

      // Comparaison exacte avec support des wildcards (*)
      const escapedUrl2 = normalizedUrl2.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');

      if (new RegExp(`^${escapedUrl2}$`).test(normalizedUrl1)) {
        return true;
      }

      // Comparaison par suffixe : l'URL actuelle peut avoir moins de segments
      const segments1 = normalizedUrl1.split('/').filter((s) => s);
      const segments2 = normalizedUrl2.split('/').filter((s) => s);

      if (segments1.length < segments2.length) {
        const mockSuffix = segments2.slice(-segments1.length);
        return segments1.every((seg, i) => {
          const mockSeg = mockSuffix[i];
          if (mockSeg.includes('*')) {
            const pattern = mockSeg.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');
            return new RegExp(`^${pattern}$`).test(seg);
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

      // 4. Vérifier les wildcards
      for (const wildcardRecord of mockWildcardRecords) {
        const escapedPattern = wildcardRecord.normalizedKey.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*');

        if (new RegExp(`^${escapedPattern}$`).test(normalized)) {
          addToCache(cacheKey, wildcardRecord.record);
          return wildcardRecord.record;
        }

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

    // ============================================================================
    // Fonction de recherche principale
    // ============================================================================

    const findMockRecord = (url: string): TuelloRecord | undefined => {
      const records = window['tuelloRecords'] as TuelloRecord[] | string | undefined;
      if (!records || typeof records === 'string') return undefined;

      // Utiliser la recherche optimisée si l'index est disponible
      if (mockIndexExact.size > 0 || mockWildcardRecords.length > 0) {
        return findMockRecordOptimized(url);
      }

      // Fallback sur la recherche linéaire
      return records.find(({ key }) => compareWithMockLevel(url, key));
    };

    // ============================================================================
    // Initialisation de l'index au chargement
    // ============================================================================

    const initIndex = (): void => {
      const records = window['tuelloRecords'];
      if (records && typeof records !== 'string' && Array.isArray(records) && records.length > 0) {
        buildMockIndex(records as TuelloRecord[]);
      }
    };

    // ============================================================================
    // Mock HTTP
    // ============================================================================

    let mockHttp = {
      originalSendXHR: window.XMLHttpRequest.prototype.send,
      originalOpenXHR: window.XMLHttpRequest.prototype.open,

      modifyResponse: (isOnLoad: boolean = false, xhr: XMLHttpRequest) => {
        const record = findMockRecord(xhr['originalURL']);
        if (record) {
          if (record.delay && isOnLoad) {
            sleep(record.delay);
          }
          const responseBody = JSON.stringify(record.response);
          Object.defineProperty(xhr, 'response', { writable: true });
          Object.defineProperty(xhr, 'responseText', { writable: true });
          Object.defineProperty(xhr, 'status', { writable: true });
          // @ts-expect-error
          xhr.responseText = responseBody;
          // @ts-expect-error
          xhr.response = record.response;
          // @ts-expect-error
          xhr.status = record.httpCode;

          // Simuler les headers avec les headers enregistrés du record
          const mockHeaders: Record<string, string> = {
            'content-type': 'application/json',
            'content-length': new TextEncoder().encode(responseBody).length.toString(),
            ...record.headers
          };

          xhr.getResponseHeader = (name: string) => {
            const lowerName = name.toLowerCase();
            const key = Object.keys(mockHeaders).find((k) => k.toLowerCase() === lowerName);
            return key ? mockHeaders[key] : null;
          };
          xhr.getAllResponseHeaders = () =>
            Object.entries(mockHeaders)
              .map(([key, value]) => `${key}: ${value}`)
              .join('\r\n');
        }
      },

      sendXHR: function (this: XMLHttpRequest) {
        const self = this;
        const realOnReadyStateChange = self.onreadystatechange;

        self.onreadystatechange = function () {
          if (self.readyState === 4) {
            mockHttp.modifyResponse(false, self);
          }

          if (realOnReadyStateChange) {
            realOnReadyStateChange.apply(this, arguments as any);
          }
        };
        return mockHttp.originalSendXHR.apply(this, arguments as any);
      },

      openXHR: function (method, url) {
        // Permet de palier le problème de CORS : on bascule sur le même serveur
        try {
          const urlObj = new URL(url);
          urlObj.port = '';
          urlObj.password = '';
          urlObj.username = '';
          const currentURL = new URL(window.location.href);
          url = urlObj.toString().replace(urlObj.origin, currentURL.origin);
        } catch (e) {
          // ignore
        }

        this['originalURL'] = url;
        return mockHttp.originalOpenXHR.apply(this, arguments as any);
      },

      originalFetch: window.fetch.bind(window),
      mockFetch: function (...args) {
        return mockHttp.originalFetch(...args).then((response) => {
          const record = findMockRecord(args[0]);

          if (record) {
            if (record.delay) {
              sleep(record.delay);
            }

            const body = JSON.stringify(record.response);
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(body));
                controller.close();
              }
            });

            // Créer les headers avec des valeurs par défaut
            const headers = new Headers();
            headers.set('Content-Type', 'application/json');
            headers.set('Content-Length', new TextEncoder().encode(body).length.toString());

            // Ajouter les headers enregistrés du record (ils écrasent les valeurs par défaut)
            if (record.headers) {
              Object.entries(record.headers).forEach(([key, value]) => {
                headers.set(key, value);
              });
            }

            const newResponse = new Response(stream, {
              headers,
              status: record.httpCode,
              statusText: record.httpCode === 200 ? 'OK' : 'Error'
            });

            const proxy = new Proxy(newResponse, {
              get: function (target, name) {
                switch (name) {
                  case 'ok':
                  case 'redirected':
                  case 'type':
                  case 'url':
                  case 'useFinalURL':
                  case 'body':
                  case 'bodyUsed':
                    return response[name];
                }
                return target[name];
              }
            });

            for (let key in proxy) {
              if (typeof proxy[key] === 'function') {
                proxy[key] = proxy[key].bind(newResponse);
              }
            }

            return proxy;
          }

          return response;
        });
      }
    };

    // ============================================================================
    // Activation
    // ============================================================================

    // Construire l'index au chargement
    initIndex();

    (window as any).XMLHttpRequest.prototype.open = mockHttp.openXHR;
    (window as any).XMLHttpRequest.prototype.send = mockHttp.sendXHR;
    (window as any).fetch = mockHttp.mockFetch;
  }
})['tuello']();
