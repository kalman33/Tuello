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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tuelloRecords?: any;
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

    const escapedUrl2 = normalizedUrl2
        .replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&')
        .replace(/\*/g, '.*');

    return new RegExp(`^${escapedUrl2}$`).test(normalizedUrl1);
};

const findMockRecord = (url: string): TuelloRecord | undefined =>
    window.tuelloRecords?.find(({ key }) => compareWithMockLevel(url, key));

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
            modifyXhrResponse(req, false);
        }
        originalOnReadyStateChange?.call(this, ev);
    };
};

intercepteurHTTPMock.interceptFetch = function (response: Response): Response {
    if (!this.isActive) return response;

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
                manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);
            } else {
                manager.deactivateInterceptor(INTERCEPTOR_NAMES.HTTP_MOCK);
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
            break;
    }
}, false);

// ============================================================================
// Initialisation
// ============================================================================

manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_RECORDER);
manager.activateInterceptor(INTERCEPTOR_NAMES.HTTP_TAGS);
