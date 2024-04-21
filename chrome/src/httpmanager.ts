// Sauvegarde des méthodes originales
const originalOpen = (window as any).XMLHttpRequest.prototype.open;
const originalSend = (window as any).XMLHttpRequest.prototype.send;
// const originalFetch = window.fetch.bind(window);

let deepMockLevel = 0;

class Interceptor {
    name: string;
    isActive: boolean;
    constructor(name) {
        this.name = name;
        this.isActive = false;
    }

    // Méthode pour intercepter la requête
    intercept(req) {
        if (this.isActive) {
            console.log(`Interception par ${this.name}`);
            // Modifier la requête ici
        }
    }
}

class InterceptorManager {
    interceptors: Interceptor[];

    constructor() {
        this.interceptors = [];
    }

    addInterceptor(interceptor) {
        this.interceptors.push(interceptor);
    }

    activateInterceptor(name) {
        const interceptor = this.interceptors.find(i => i.name === name);
        if (interceptor) {
            interceptor.isActive = true;
        }
    }

    deactivateInterceptor(name) {
        const interceptor = this.interceptors.find(i => i.name === name);
        if (interceptor) {
            interceptor.isActive = false;
        }
    }

    // Méthode pour exécuter les intercepteurs
    runInterceptors(req) {
        this.interceptors.forEach(interceptor => interceptor.intercept(req));
    }
}

// Création du gestionnaire
const manager = new InterceptorManager();

// Surcharge des méthodes XMLHttpRequest
XMLHttpRequest.prototype.open = function (method, url) {
    this.interceptorManager = manager;
    // Stocker l'URL dans l'objet XMLHttpRequest
    this["originalURL"] = url;

    return originalOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function (data) {
    this.interceptorManager.runInterceptors(this);
    return originalSend.apply(this, arguments);
};

// Surcharge du fetch


// Déclaration des intercepteurs
const intercepteurHTTPRecorder = new Interceptor('intercepteurHTTPRecorder');
const intercepteurHTTPMock = new Interceptor('intercepteurHTTPMock');
const intercepteurHTTPTags = new Interceptor('intercepteurHTTPTags');

manager.addInterceptor(intercepteurHTTPRecorder);
manager.addInterceptor(intercepteurHTTPMock);
manager.addInterceptor(intercepteurHTTPTags);



// definition des methode intercept des intercepteurs
intercepteurHTTPMock.intercept = function(req) {
    if (this.isActive) {
        const realOnReadyStateChange = req.onreadystatechange;
        const self = this;

        req.onreadystatechange = function () {

            // Vérifie si la requête est terminée (readyState === 4)
            if (req.readyState === 4) {
                modifyResponse(false, req);
            }

            // Appelle la fonction de rappel d'origine avec la réponse modifiée
            if (realOnReadyStateChange) {
                realOnReadyStateChange.apply(req, arguments as any);
            }
        }
    }
}
intercepteurHTTPRecorder.intercept = function(req) {
    if (this.isActive) {
        const realOnReadyStateChange = req.onreadystatechange;

        req.onreadystatechange = function () {
            // Vérifie si la requête est terminée (readyState === 4)
            if (req.readyState === 4) {
                if (req.responseURL && typeof req.responseURL === 'string' && !req.responseURL.includes('tuello') && !req.responseURL.includes('sockjs')) {
                    let response = '';
                    try {
                        response = JSON.parse(req.responseText);

                    } catch (e) {
                        response = req.responseText;
                        // error
                        console.log('Tuello : Problème de parsing de la reponse', e);
                    }

                    const messageHttpRecorder = {
                        type: 'RECORD_HTTP',
                        url: req.responseURL,
                        delay: 0,
                        response: response,
                        status: req.status,
                        method: req['xhrMethod'] || '',
                        hrefLocation: window.location.href
                    }
                    window.postMessage(messageHttpRecorder, '*');
                }
            }
            if (realOnReadyStateChange) {
                realOnReadyStateChange.apply(this, arguments as any);
            }
        };
    }
}

intercepteurHTTPTags.intercept = function(req) {
    if (this.isActive) {
        const realOnReadyStateChange = req.onreadystatechange;

        req.onreadystatechange = function () {
            // Vérifie si la requête est terminée (readyState === 4)
            if (req.readyState === 4) {
                if (req.responseURL && typeof req.responseURL === 'string' && !req.responseURL.includes('tuello') && !req.responseURL.includes('sockjs')) {
                    let response = '';
                    try {
                        response = JSON.parse(req.responseText);

                    } catch (e) {
                        response = req.responseText;
                        // error
                        console.log('Tuello : Problème de parsing de la reponse', e);
                    }

                    const messageHTTPTags = {
                        type: 'ADD_HTTP_CALL_FOR_TAGS',
                        url: req.responseURL,
                        response: response
                    }

                    window.top.postMessage(messageHTTPTags, '*');

                }
            }

        }
    }
}

/**
 * Listener des post message provenant de contentscript
 */
window.addEventListener(
    'message',
    // tslint:disable-next-line:only-arrow-functions
    function (event) {
        if (event?.data?.type && event?.data?.type === 'MOCK_HTTP_ACTIVATED') {
            if (event.data.value) {
                deepMockLevel = event.data.deepMockLevel || 0;
                (window as any).tuelloRecords = event.data.tuelloRecords;
                manager.activateInterceptor('intercepteurHTTPMock');
            } else {
                manager.deactivateInterceptor('intercepteurHTTPMock');

            }
        } else if (event?.data?.type === 'RECORD_HTTP_ACTIVATED') {
            if (event.data.value) {
                deepMockLevel = event.data.deepMockLevel || 0;
                (window as any).tuelloRecords = event.data.tuelloRecords;
                manager.activateInterceptor('intercepteurHTTPRecorder');
            } else {
                manager.deactivateInterceptor('intercepteurHTTPRecorder');

            }
        } else if (event?.data?.type === 'RECORD_HTTP_CALL_FOR_TAGS') {
            if (event.data.value) {
                deepMockLevel = event.data.deepMockLevel || 0;
                (window as any).tuelloRecords = event.data.tuelloRecords;
                manager.activateInterceptor('intercepteurHttpTags');
            } else {
                manager.deactivateInterceptor('intercepteurHttpTags');

            }
        }// else ignore messages seemingly not sent to yourself
    },
    false,
);


let removeURLPortAndProtocol = (url: string) => {
    let ret = '';
    try {
        let parseURL = new URL(url);
        parseURL.port = '';
        ret = parseURL.toString();
        ret = ret.replace(/^https?:\/\//, '')
    } catch (e) {
        ret = url;
    }
    return ret;
}

let compareWithMockLevel = (url1, url2) => {
    if (typeof url2 !== 'string' || typeof url2 !== 'string') {
        return false;
    }
    url1 = removeURLPortAndProtocol(url1);
    url2 = removeURLPortAndProtocol(url2);
    let inc = deepMockLevel;
    // @ts-ignore
    while (inc > 0) {
        // @ts-ignore
        url1 = url1.replace(url1.split('/', inc).join('/'), '');
        // @ts-ignore
        url2 = url2.replace(url2.split('/', inc).join('/'), '');
        if (url1 && url2) {
            break;
        }
        // @ts-ignore
        inc--;
    }
    url1 = url1.replace(/^\//, '');
    url2 = url2.replace(/^\//, '');

    /**const lg1 = url1.split('/').length;
    const lg2 = url2.split('/').length;
  
    if (lg1 > lg2) {
      url1 = url1.split('/').slice(0, lg2).join('/');
    } else if (lg2 > lg1) {
      url2 = url2.split('/').slice(0, lg1).join('/');
    }*/

    return new RegExp('^' + url2.replace(/[.+?^=!:${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*') + '$').test(url1);
};

let sleep = (ms: number) => {
    const stop = new Date().getTime() + ms;
    while (new Date().getTime() < stop) { }
}

let modifyResponse = (isOnLoad: boolean = false, xhr: XMLHttpRequest) => {

    if ((window as any).tuelloRecords) {
        // this.responseURL
        const records = (window as any).tuelloRecords.filter(({ key, response, httpCode }) => compareWithMockLevel(xhr["originalURL"], key));
        if (records && records.length > 0) {
            records.forEach(({ key, response, httpCode, delay }) => {
                if (delay && isOnLoad) {
                    sleep(delay);
                }
                Object.defineProperty(xhr, 'response', { writable: true });
                Object.defineProperty(xhr, 'responseText', { writable: true });
                Object.defineProperty(xhr, 'status', { writable: true });
                // @ts-expect-error
                xhr.responseText = JSON.stringify(response);
                // Object.defineProperty(this,'responseText', JSON.stringify(response));
                // @ts-expect-error
                xhr.response = response;
                // @ts-expect-error
                xhr.status = httpCode;

            });
        }
    }
}
