import { logData } from "./utils/utils";

// ============================================================================
// Types et Interfaces
// ============================================================================

interface TuelloRecord {
    key: string;
    response: unknown;
    httpCode: number;
    delay?: number;
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
    MOCK_HTTP_TUELLO_RECORDS: 'MOCK_HTTP_TUELLO_RECORDS',
} as const;

const INTERCEPTOR_NAMES = {
    HTTP_RECORDER: 'intercepteurHTTPRecorder',
    HTTP_MOCK: 'intercepteurHTTPMock',
    HTTP_TAGS: 'intercepteurHTTPTags',
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
}> = [];
let pendingMockFetchQueue: Array<{
    resolve: (response: Response) => void;
    response: Response;
}> = [];

// ============================================================================
// Utilitaires
// ============================================================================

const isExcludedUrl = (url: string): boolean =>
    EXCLUDED_URL_PATTERNS.some(pattern => url.includes(pattern));

const sleepSync = (ms: number): void => {
    const stop = Date.now() + ms;
    while (Date.now() < stop) { /* busy wait */ }
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

const removeURLPortAndProtocol = (url: string): string => {
    try {
        const parseURL = new URL(url);
        parseURL.port = '';
        return parseURL.toString().replace(/^https?:\/\//, '');
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
    const escapedUrl2 = normalizedUrl2
        .replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&')
        .replace(/\*/g, '.*');

    if (new RegExp(`^${escapedUrl2}$`).test(normalizedUrl1)) {
        return true;
    }

    // Comparaison par suffixe : l'URL actuelle peut avoir moins de segments (contextRoot manquant)
    // Ex: mock = "global/text1/text2/text3", actuel = "text1/text2/text3" → match
    const segments1 = normalizedUrl1.split('/').filter(s => s);
    const segments2 = normalizedUrl2.split('/').filter(s => s);

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
    return records.find(({ key }: TuelloRecord) => compareWithMockLevel(url, key));
};

// Traite la queue des XHR en attente de mock
const processPendingMockXhrQueue = (): void => {
    logData(`- Mock HTTP - Traitement de ${pendingMockXhrQueue.length} requêtes XHR en attente`);

    while (pendingMockXhrQueue.length > 0) {
        const pending = pendingMockXhrQueue.shift();
        if (!pending) continue;

        const { xhr, originalCallback } = pending;

        // Si la requête est terminée, on applique le mock et on re-déclenche le callback
        if (xhr.readyState === XMLHttpRequest.DONE) {
            modifyXhrResponse(xhr, false);
            if (originalCallback) {
                originalCallback.call(xhr, new Event('readystatechange'));
            }
        }
    }
};

// Traite la queue des fetch en attente de mock
const processPendingMockFetchQueue = (): void => {
    logData(`- Mock HTTP - Traitement de ${pendingMockFetchQueue.length} requêtes Fetch en attente`);

    while (pendingMockFetchQueue.length > 0) {
        const pending = pendingMockFetchQueue.shift();
        if (!pending) continue;

        const { resolve, response } = pending;
        const record = findMockRecord(response.url);

        if (record) {
            if (record.delay) {
                sleepSync(record.delay);
            }
            logData('- Mock HTTP - Mock de ' + response.url);
            resolve(createMockedResponse(response, record));
        } else {
            logData('- Mock HTTP - Mock non trouvé de ' + response.url);
            resolve(response);
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

    return new Response(stream, {
        headers: originalResponse.headers,
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

type InterceptorName = typeof INTERCEPTOR_NAMES[keyof typeof INTERCEPTOR_NAMES];

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

XMLHttpRequest.prototype.open = function (
    this: ExtendedXMLHttpRequest,
    method: string,
    url: string | URL,
    ...args: unknown[]
): void {
    this.interceptorManager = manager;
    this.originalURL = url.toString();
    this.xhrMethod = method;
    return originalOpen.call(this, method, url, ...args as [boolean?, string?, string?]);
};

XMLHttpRequest.prototype.send = function (
    this: ExtendedXMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null
): void {
    this.interceptorManager?.runInterceptorsXHR(this);
    return originalSend.call(this, body);
};

// ============================================================================
// Surcharge Fetch
// ============================================================================

window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
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

    // Si tuelloRecords n'est pas encore prêt, mettre en queue
    if (!tuelloRecordsReady) {
        logData('- Mock HTTP - Requête Fetch mise en queue (tuelloRecords non prêt): ' + response.url);

        // Retourner une Promise qui sera résolue quand tuelloRecords sera prêt
        return new Promise<Response>((resolve) => {
            pendingMockFetchQueue.push({ resolve, response });
        });
    }

    // tuelloRecords est prêt, appliquer le mock normalement
    const record = findMockRecord(response.url);
    if (!record) {
        logData('- Mock HTTP - Mock non trouvé de ' + response.url);
        return response;
    }

    if (record.delay) {
        sleepSync(record.delay);
    }

    logData('- Mock HTTP - Mock de ' + response.url);
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
                            flushQueue(window, messageForHTTPRecorderQueue);
                            sendMessage(window, message);
                        } else {
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

intercepteurHTTPRecorder.interceptFetch = async function (
    response: Response,
    ...args: unknown[]
): Promise<Response> {
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
        flushQueue(window, messageForHTTPRecorderQueue);
        sendMessage(window, serializedMessage);
    } else {
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

intercepteurHTTPTags.interceptFetch = async function (
    response: Response
): Promise<Response> {
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

window.addEventListener('message', (event: MessageEvent) => {
    const { data } = event;
    if (!data?.type) return;

    switch (data.type) {
        case MESSAGE_TYPES.MOCK_HTTP_ACTIVATED:
            if (data.value) {
                deepMockLevel = data.deepMockLevel || 0;
                window.tuelloRecords = typeof data.tuelloRecords === 'string'
                    ? JSON.parse(data.tuelloRecords)
                    : data.tuelloRecords || [];

                // Marquer que l'utilisateur a activé le mock
                mockUserActivated = true;
                manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);

                // Si on a des records, traiter les requêtes en attente
                if (window.tuelloRecords && window.tuelloRecords.length > 0) {
                    onTuelloRecordsReady();
                }
            } else {
                mockUserActivated = false;
                manager.deactivateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);
                // Vider les queues si le mock est désactivé
                pendingMockXhrQueue = [];
                pendingMockFetchQueue = [];
            }
            break;

        case MESSAGE_TYPES.RECORD_HTTP_ACTIVATED:
            if (data.value) {
                flushQueue(window, messageForHTTPRecorderQueue);
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
            window.tuelloRecords = typeof data.tuelloRecords === 'string'
                ? JSON.parse(data.tuelloRecords)
                : data.tuelloRecords || [];

            // Si on a des records et que le mock est activé, traiter les requêtes en attente
            if (window.tuelloRecords && window.tuelloRecords.length > 0) {
                onTuelloRecordsReady();
            }
            break;
    }
}, false);

// ============================================================================
// Initialisation
// ============================================================================

manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_RECORDER);
manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_TAGS);
manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);  // Activer le mock dès le départ pour capturer les premières requêtes
