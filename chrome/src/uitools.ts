import { addEventListener, addLoadEvent } from './utils/utils';

const actionsFromUI = [
  'RECORD_HTTP',
  'RECORD_HTTP_READY',
  'RECORD_MOCK_READY',
];

const actionsFromDevtools = ['UI_RECORDER_ACTIVATED', 'RECORD_HTTP_ACTIVATED', 'MOCK_HTTP_ACTIVATED', 'PLAY_USER_ACTION'];

function postMessageListener(event: MessageEvent) {
  if (event.data.type && actionsFromUI.includes(event.data.type)) {
    let protocol = 'http:';
    if (window.location.protocol === 'https:') {
      protocol = 'https:';
    }
    const xmlhttp = new XMLHttpRequest(); // new HttpRequest instance
    const theUrl = `${protocol}//tuello.dummy.fr/dummy`;
    xmlhttp.open('POST', theUrl);
    // xmlhttp.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');

    xmlhttp.setRequestHeader('Access-Control-Max-Age', '*');
    xmlhttp.setRequestHeader('resp.http.Access-Control-Allow-Origin', '*');
    xmlhttp.setRequestHeader('resp.http.Access-Control-Max-Age', '1728000');
    xmlhttp.setRequestHeader('resp.http.Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    xmlhttp.setRequestHeader(
      'resp.http.Access-Control-Allow-Headers',
      'Authorization,Content-Type,Accept,Origin,User-Agent,DNT,Cache-Control,X-Mx-ReqToken,Keep-Alive,X-Requested-With,If-Modified-Since',
    );
    xmlhttp.setRequestHeader('resp.http.Content-Length', '0');
    xmlhttp.setRequestHeader('resp.http.Content-Type', 'text/plain charset=UTF-8');

    xmlhttp.send(JSON.stringify(event.data));
  }
}

window.addEventListener(
  'message',
  // tslint:disable-next-line:only-arrow-functions
  postMessageListener,
);

window['observeIframeFunc'] = (code: string) => {
  // on regarde si des nouvelles iframe sont chargées
  new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      [].filter
        .call(mutation.addedNodes, node => {
          return node && node.querySelector ? node.querySelector('iframe') : false;
        })
        .map(node => node.querySelector('iframe'))
        .forEach(iframe => {
          addLoadEvent(iframe, () => {

            const innerDoc = iframe.contentDocument;
            const innerWindow = iframe.contentWindow;
            const iframecontainer = innerDoc.createElement('script');
            iframecontainer.setAttribute('type', 'text/javascript');
            iframecontainer.innerText = code;
            innerDoc.body.appendChild(iframecontainer);

            Array.from(document.getElementsByTagName('iframe')).forEach((item, index) => {
              if (innerWindow === item.contentWindow) {
                innerWindow['TuelloFrameIndex'] = index;
                // on lui renvoit les activations reçues précédement
              }
            });

            // On envoie l'état d'activation des différents fonctionnalités à l'iframe
            window['MMA_ACTIVATION'].forEach(value => {
              innerWindow.postMessage(value, '*');
            });

            /// on récupère tous les post message provenant de devtools pour les renvoyer aux iframes
            addEventListener('message', transfererPostMessageListener);

            innerWindow['observeIframeFunc'](code);
          });
        });
    });
  }).observe(document.documentElement || document.body, { childList: true, subtree: true });
};

// on stock l'état d'activation des différents fonctionnalités pour transmettre l'info aux iframes à leur ouverture
addEventListener('message', (event: MessageEvent) => {
  if (event.data.type && event.data.type.includes('_ACTIVATED') && event.data.value) {
    if (!window['MMA_ACTIVATION']) {
      window['MMA_ACTIVATION'] = new Map();
    }
    window['MMA_ACTIVATION'].set(event.data.type, event.data);
  }
});

function transfererPostMessageListener(event: MessageEvent) {
  if (event.data.type && actionsFromDevtools.includes(event.data.type)) {
    Array.from(document.getElementsByTagName('iframe')).forEach((item, index) => {
      item.contentWindow.postMessage(event.data, '*');
    });
  }
}

