// Sauvegarde des méthodes originales
const originalOpen = (window as any).XMLHttpRequest.prototype.open;
const originalSend = (window as any).XMLHttpRequest.prototype.send;
const originalFetch = window.fetch.bind(window);
let messageForHTTPRecorderQueue = [];
let messageForHTTPTagsQueue = [];


let deepMockLevel = 0;

class Interceptor {
    name: string;
    isActive: boolean;
    userActivation = false;
    constructor(name) {
        this.name = name;
        this.isActive = false;
    }

    // Méthode pour intercepter la requête XHR
    interceptXHR(req) {
        if (this.isActive) {
            // console.log(`Interception XHR par ${this.name}`);
            // Modifier la requête ici
        }
    }

    // Méthode pour intercepter la requête fetch
    interceptFetch(response, ...args) {
        if (this.isActive) {
            // console.log(`Interception Fetch par ${this.name}`);
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

    activateInterceptorByUser(name) {
        const interceptor = this.interceptors.find(i => i.name === name);
        if (interceptor) {
            interceptor.isActive = true;
            interceptor.userActivation = true;
        }
    }

    deactivateInterceptor(name) {
        const interceptor = this.interceptors.find(i => i.name === name);
        if (interceptor) {
            interceptor.isActive = false;
        }
    }

    // Méthode pour exécuter les intercepteurs XHR
    runInterceptorsXHR(req) {
        this.interceptors.forEach(interceptor => interceptor.interceptXHR(req));
    }

    // Méthode pour exécuter les intercepteurs Fetch et retourner la réponse modifiée
    async runInterceptorsFetch(response, ...args) {
        let modifiedResponse = response;
        for (const interceptor of this.interceptors) {
            // Exécuter interceptFetch et attendre la réponse modifiée
            modifiedResponse = await interceptor.interceptFetch(modifiedResponse, ...args);
        }
        return modifiedResponse;
    }

    applyInterceptorsXHR(req) {
        const applyNextInterceptor = (index) => {
            if (index < this.interceptors.length) {
                const interceptor = this.interceptors[index];
                if (interceptor.isActive) {
                    interceptor.interceptXHR(req);

                }
                applyNextInterceptor(index + 1);
            }
        };
        applyNextInterceptor(0);
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
    this.interceptorManager.runInterceptorsXHR(this);
    return originalSend.apply(this, arguments);
};


// Surcharge du fetch
(window as any).fetch = async (...args) => {
    const response = await originalFetch(...args);
    // Exécuter les intercepteurs et obtenir la réponse modifiée
    const modifiedResponse = await manager.runInterceptorsFetch(response, ...args);
    // modifiedResponse.json().then(body => console.log('TUELLO BODY', body));

    return modifiedResponse;
};

// Déclaration des intercepteurs
const intercepteurHTTPRecorder = new Interceptor('intercepteurHTTPRecorder');
const intercepteurHTTPMock = new Interceptor('intercepteurHTTPMock');
const intercepteurHTTPTags = new Interceptor('intercepteurHTTPTags');

// Ajout des intercepteurs
manager.addInterceptor(intercepteurHTTPRecorder);
manager.addInterceptor(intercepteurHTTPMock);
manager.addInterceptor(intercepteurHTTPTags);

// definition des methode intercept des intercepteurs
intercepteurHTTPMock.interceptXHR = function (req) {
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
                realOnReadyStateChange.apply(this, arguments as any);
            }
        }
    }
}
intercepteurHTTPRecorder.interceptXHR = function (req) {
    if (this.isActive) {
        const realOnReadyStateChange = req.onreadystatechange;
        const that = this;
        req.onreadystatechange = function () {
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
                    if (that.userActivation) {
                        sendMessages(window, messageForHTTPRecorderQueue);
                        window.postMessage(messageHttpRecorder, '*');
                    } else {
                        // On rajoute les messages dans la queue
                        addToQueue(messageHttpRecorder, messageForHTTPRecorderQueue);
                    }
                }

            }
            if (realOnReadyStateChange) {
                realOnReadyStateChange.apply(this, arguments as any);
            }
        }
        
    };
}

intercepteurHTTPTags.interceptXHR = function (req) {
    if (this.isActive) {

        const that = this;
        const realOnReadyStateChange = req.onreadystatechange;
        req.onreadystatechange = function () {
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
                    if (that.userActivation) {
                        sendMessages(window.top, messageForHTTPTagsQueue);
                        window.top.postMessage(messageHTTPTags, '*');
                    } else {
                        // On rajoute les messages dans la queue
                        addToQueue(messageHTTPTags, messageForHTTPTagsQueue);
                    }
                }
            }
            if (realOnReadyStateChange) {
                realOnReadyStateChange.apply(this, arguments as any);
            }
        };

    }
}

intercepteurHTTPMock.interceptFetch = function (response, ...args) {
    if (this.isActive) {
        let txt = undefined;
        let status = undefined;
        if ((window as any).tuelloRecords) {
            const records = (window as any).tuelloRecords.filter(({ key }) =>
                compareWithMockLevel(response.url, key)
            );
            if (records && records.length > 0) {
                records.forEach(({ key, response, httpCode, delay }) => {
                    if (delay) {
                        sleep(delay);
                    }
                    txt = JSON.stringify(response);
                    status = httpCode;
                });
            }
        }

        if (txt !== undefined) {
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(txt));
                    controller.close();
                }
            });

            const newResponse = new Response(stream, {
                headers: response.headers,
                status: status,
                statusText: status === 200 ? 'OK' : 'Not Found'
            });
            const proxy = new Proxy(newResponse, {
                get: function (target, prop) {
                    const checkKeys = ['ok', 'redirected', 'type', 'url', 'useFinalURL', 'body', 'bodyUsed'];
                    if (checkKeys.includes(prop as string)) {
                        return Reflect.get(target, prop);
                    }
                    return Reflect.get(target, prop);
                },
            });

            for (let key in proxy) {
                const target = Reflect.get(proxy, key);
                if (typeof target === "function") {
                    Reflect.set(proxy, key, target.bind(newResponse));
                }
            }

            return proxy;
        }
    }
    // Si l'intercepteur n'est pas actif ou si la réponse ne doit pas être modifiée,
    // retourner la réponse originale
    return response;
}


intercepteurHTTPRecorder.interceptFetch = async function (response, ...args) {
    if (this.isActive) {
        if (args[0] && typeof args[0] === 'string') {
            let dataForRecordHTTP: any =
            {
                type: 'RECORD_HTTP',
                url: response.url,
                delay: 0,
                status: response.status,
                method: args[1] ? args[1].method : "GET",
                body: args[1] ? args[1].body : undefined,
                hrefLocation: window.location.href
            };
            let data: any = {};
            try {
                // Essayer de lire le corps de la réponse en tant que JSON
                const responseBody = await response.clone().json();
                data.response = responseBody;
            } catch (error) {
                // En cas d'erreur, enregistrer l'erreur dans response
                data.response = error
            } finally {

                // Envoyer le message contenant les données enregistrées
                //const message = JSON.parse(JSON.stringify(data));
                let message = { ...data, ...dataForRecordHTTP };
                message = JSON.parse(JSON.stringify(message));
                
                if (this.userActivation) {
                    sendMessages(window, messageForHTTPTagsQueue);
                    window.postMessage(message, '*');
                } else {
                    // On rajoute les messages dans la queue
                    addToQueue(message, messageForHTTPTagsQueue);
                }
            }

        }

    }
    // Si l'intercepteur n'est pas actif ou si la réponse ne doit pas être modifiée,
    // retourner la réponse originale
    return response;
}

intercepteurHTTPTags.interceptFetch = async function (response, ...args) {
    if (this.isActive) {
        if (response && typeof response.url === 'string') {
            let dataForTags: any = { url: response.url, type: 'ADD_HTTP_CALL_FOR_TAGS' };
            let data: any = {};
            try {
                // Essayer de lire le corps de la réponse en tant que JSON
                const responseBody = await response.clone().json();
                data.response = responseBody;
            } catch (error) {
                // En cas d'erreur, enregistrer l'erreur dans response
                data.response = error
            } finally {
                let message = { ...data, ...dataForTags };
                message = JSON.parse(JSON.stringify(message));
                if (this.userActivation) {
                    sendMessages(window.top, messageForHTTPTagsQueue);
                    window.top.postMessage(message, '*');
                } else {
                    // On rajoute les messages dans la queue
                    addToQueue(message, messageForHTTPTagsQueue);
                }
               
            }

        }

    }
    // Si l'intercepteur n'est pas actif ou si la réponse ne doit pas être modifiée,
    // retourner la réponse originale
    return response;
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
                sendMessages(window, messageForHTTPRecorderQueue);
                manager.activateInterceptorByUser('intercepteurHTTPRecorder');
            } else {
                manager.deactivateInterceptor('intercepteurHTTPRecorder');
                messageForHTTPRecorderQueue = [];


            }
        } else if (event?.data?.type === 'RECORD_HTTP_CALL_FOR_TAGS') {
            if (event.data.value) {
                sendMessages(window.top, messageForHTTPTagsQueue);
                manager.activateInterceptorByUser('intercepteurHTTPTags');
            } else {
                manager.deactivateInterceptor('intercepteurHTTPTags');
                messageForHTTPTagsQueue = [];

            }
        } 
        
        
        // else ignore messages seemingly not sent to yourself
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
    if (!url1 || !url1 || typeof url1 !== 'string' || typeof url2 !== 'string') {
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



// Au départ on active pour éviter de perdre des messages
manager.activateInterceptor('intercepteurHTTPRecorder');
manager.activateInterceptor('intercepteurHTTPTags');


// Fonction pour ajouter un message à la file d'attente
function addToQueue(message, file) {
    file.push(message);
}

// Fonction pour vider la file d'attente et envoyer les messages
function sendMessages(targetWindow, file) {
    while (file.length > 0) {
        var message = file.shift();
        // Envoyer le message à la cible appropriée avec postMessage()
        targetWindow.postMessage(message, '*');
    }
}

