import { Track } from '../models/Track';
import { TrackType } from '../models/TrackType';
import { UserAction } from '../models/UserAction';
import { clickInside, getElementFromXPath, getXPath, isFixedPosition, isVisible } from './utils';

let lastUserAction: UserAction;
let performanceObserver;

let tuelloTracks;
let body;
let httpElements = new Map<string, any>();


export function activateRecordTracks() {

  displayTracks();

  // on observe les événements de mesure des performances de type resource
  if (!performanceObserver) {
    // @ts-ignore
    performanceObserver = new PerformanceObserver(recordListener);
    performanceObserver.observe({ type: "resource", buffered: true });
    // on active le listener pour le click souris
    document.removeEventListener('click', clickListener);
    document.addEventListener('click', clickListener);
  }

  httpElements = new Map<string, any>();
  (window as any).XMLHttpRequest = recorderHttp.recordXHR;
  window.fetch = recorderHttp.recordFetch;
}

export function desactivateRecordTracks() {
  if (performanceObserver) {
    performanceObserver.disconnect();
    performanceObserver = undefined;

  }
  document.removeEventListener('click', clickListener);
  removeTracks();

  httpElements = new Map<string, any>();
  (window as any).XMLHttpRequest = recorderHttp.originalXHR;
  window.fetch = recorderHttp.originalFetch;
}

export function displayTracks() {

  removeTracks();

  getTuelloTracks().then(() => {
    const tracks = tuelloTracks.filter(item => {
      // on ne garde que les tracks de cette page
      if (item.hrefLocation === window.location.href) {
        if (item.type === TrackType.CLICK) {
          return isVisible(item.element);
        } else {
          return true;
        }
      } else {
        return false;
      }
    });


    if (tracks && tracks.length > 0) {
      tracks.forEach(track => {
        displayTrack(track);
      });
    }
  }).catch(() => {
  });
}

function getTuelloTracks() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['tuelloTracks'], results => {
      if (!chrome.runtime.lastError) {
        tuelloTracks = results['tuelloTracks'] || [];
        resolve(true);
      } else {
        reject(false)
      }
    });
  });
}
/**
 const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  let [resource, config] = args;

  let response = await originalFetch(resource, config);
  
  return response;
};
 */

function recordListener(list) {


  if (chrome && chrome.storage && chrome.storage.local) {
    // récupération du tracking data
    chrome.storage.local.get(['tuelloTrackData'], results => {
      let trackData = results['tuelloTrackData'];
      trackData = trackData.substring(5, trackData.length);
      if (trackData && trackData.includes('body.')) {
        httpElements.forEach((value, key) => {
            if (value.includes(trackData)) {
              // on track
              const track = new Track();
              track.x = lastUserAction?.x;
              track.y = lastUserAction?.y;

              track.hrefLocation = window.location.href;

              const url = new URL(value)
              // initiatorType: "xmlhttprequest"
              if (url.search) {
                track.url = url.href.replace(url.search, "");
                track.querystring = key;
              } else {
                track.url = url.href;
              }

              if (window.location.href === lastUserAction?.hrefLocation) {
                // on est sur le meme href : c'est un track click
                track.type = TrackType.CLICK;
                track.element = getXPath(lastUserAction.element);
                track.id = 'tuelloTrackClick' + Math.floor(Math.random() * Math.floor(Math.random() * Date.now()));
                track.parentPosition = isFixedPosition(getElementFromXPath(track.element)) ? 'fixed' : 'absolute'

              } else {
                // c'est un track page page
                track.type = TrackType.PAGE;
                track.parentPosition = 'fixed';
                track.id = 'tuelloTrackPage' + Math.floor(Math.random() * Math.floor(Math.random() * Date.now()));
              }
              track.htmlCoordinates = lastUserAction?.htmlCoordinates;

              appendTrack(track);
            }
          });
      } else {
        list.getEntries().filter(entry => {
          return entry.name.includes(trackData);
        }).forEach(entry => {
          // on track
          const track = new Track();
          track.x = lastUserAction?.x;
          track.y = lastUserAction?.y;

          track.hrefLocation = window.location.href;

          const url = new URL(entry.name)
          // initiatorType: "xmlhttprequest"
          if (url.search) {
            track.url = url.href.replace(url.search, "");
            track.querystring = decodeURI(url.search.substring(1))
              .split('&')
              .reduce((result, current) => {
                const [key, value] = current.split('=');

                result[key] = value;

                return result
              }, {})
          } else {
            track.url = url.href;
          }

          if (window.location.href === lastUserAction?.hrefLocation) {
            // on est sur le meme href : c'est un track click
            track.type = TrackType.CLICK;
            track.element = getXPath(lastUserAction.element);
            track.id = 'tuelloTrackClick' + Math.floor(Math.random() * Math.floor(Math.random() * Date.now()));
            track.parentPosition = isFixedPosition(getElementFromXPath(track.element)) ? 'fixed' : 'absolute'

          } else {
            // c'est un track page page
            track.type = TrackType.PAGE;
            track.parentPosition = 'fixed';
            track.id = 'tuelloTrackPage' + Math.floor(Math.random() * Math.floor(Math.random() * Date.now()));
          }
          track.htmlCoordinates = lastUserAction?.htmlCoordinates;

          appendTrack(track);
        });
      }



    });
  }

}

function clickListener(e) {
  lastUserAction = new UserAction(e);

  let target = e.target || e.srcElement;
  while (target) {
    if (target instanceof HTMLAnchorElement || target instanceof HTMLButtonElement) {
      break;
    }
    target = target.parentNode;
  }
  if (target && (!target.id || !target.id.includes('tuello'))) {
    const rect = target.getBoundingClientRect();
    lastUserAction.htmlCoordinates = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    }
    lastUserAction.element = target;
  }

  displayTracks();
}

function appendTrack(track: Track) {
  chrome.storage.local.get(['tuelloTracks'], items => {
    if (!items.tuelloTracks) {
      items.tuelloTracks = [];
    }

    if (track.type === TrackType.PAGE) {
      // on ne rajoute le track page que si il n'existe pas deja
      if (!items.tuelloTracks.find(elt => elt.type === TrackType.PAGE &&
        elt.hrefLocation == track.hrefLocation &&
        elt.url == track.url)) {
        items.tuelloTracks.push(track);
        displayTrack(track);
      }
    } else {
      // on ne rajoute le track click que si il n'existe pas deja
      if (!items.tuelloTracks.find(elt => {
        return elt.type === TrackType.CLICK &&
          elt.hrefLocation == track.hrefLocation &&
          elt.url == track.url &&
          clickInside(elt.htmlCoordinates, track.x, track.y);
      }
      )) {

        items.tuelloTracks.push(track);
        displayTrack(track);
      }
    }
    tuelloTracks = items.tuelloTracks;
    chrome.storage.local.set({ tuelloTracks: items.tuelloTracks }, () => {

      chrome.runtime.sendMessage(
        {
          refreshTrackData: true
        },
        response => {

        }
      );
    });
  });
}

function displayTrack(track: Track) {

  if (track.type === TrackType.PAGE) {

    if (!document.getElementById(track.id)) {
      const trackDiv = document.createElement('div');
      // trackDiv.style.pointerEvents = 'none';
      trackDiv.classList.add('tuello-track');
      trackDiv.style.margin = '0px';
      trackDiv.id = track.id;
      trackDiv.style.position = track.parentPosition;
      trackDiv.style.left = '10px';
      trackDiv.style.top = '50px';
      trackDiv.style.paddingTop = '2px';
      trackDiv.style.width = '30px';
      trackDiv.style.height = '30px';
      trackDiv.style.zIndex = '99999999';
      trackDiv.style.borderRadius = '50%';
      trackDiv.style.backgroundColor = 'rgba(209, 37, 102, 0.9)';
      trackDiv.style.color = 'white';
      trackDiv.style.fontSize = '12px';
      trackDiv.style.textAlign = 'center';
      trackDiv.style.font = 'bold italic large Palatino, serif';
      const text = document.createTextNode("p");
      trackDiv.appendChild(text);
      trackDiv.onclick = (e) => {
        viewTracks(track.id);
        e.stopPropagation();
      }
      document.body.appendChild(trackDiv);
    }

  } else {

    if (!document.getElementById(track.id)) {
      let div = document.createElement('div');

      if (track.htmlCoordinates) {
        div.style.left = track.htmlCoordinates.left + track.htmlCoordinates.width + 'px';
        div.style.top = track.htmlCoordinates.top + track.htmlCoordinates.height + 'px';
      } else {
        div.style.left = track.x + 'px';
        div.style.top = track.y + 'px';
      }
      div.classList.add('tuello-track');
      div.style.width = '30px';
      div.style.paddingTop = '2px';
      div.style.height = '30px';
      div.style.borderRadius = '50%';
      div.style.backgroundColor = 'rgba(209, 37, 102, 0.9)';
      div.style.color = 'white';
      div.style.zIndex = '99999999';
      div.style.border = '3px solid #D12566';
      div.style.textAlign = 'center';
      div.style.font = 'bold italic large Palatino, serif';
      const text = document.createTextNode("c");
      div.appendChild(text);
      div.style.position = 'absolute';
      div.onclick = () => viewTracks(track.id);

      let parentDiv;
      const trackElement = getElementFromXPath(track.element);
      if (track.parentPosition === 'fixed') {
        div.style.position = 'absolute';
        div.style.left = track.htmlCoordinates.width + 'px';
        div.style.top = '0';
        parentDiv = document.createElement('div');
        parentDiv.id = track.id
        parentDiv.style.position = 'absolute';
        trackElement.insertAdjacentElement('afterend', parentDiv);
        parentDiv.appendChild(div);

      } else {
        div.id = track.id
        document.body.append(div);
      }


      if (track.htmlCoordinates) {
        const elt = track.parentPosition === 'fixed' ? parentDiv : div;
        const elementList = trackElement.children;
        // mouse over : on affiche un contour sur le lien ou le bouton
        elt.onmouseenter = (event) => {
          trackElement.classList.add('tuello-background-color');
          trackElement.classList.add('tuello-white-texte');
          for (var i = 0; i < elementList.length; i++) {
            elementList[i].classList.add('tuello-white-texte');
          }
        }

        // mouse out : on supprime le background color
        elt.onmouseout = (event) => {
          trackElement.classList.remove('tuello-background-color');
          trackElement.classList.remove('tuello-white-texte');
          for (var i = 0; i < elementList.length; i++) {
            elementList[i].classList.remove('tuello-white-texte');
          }
        }
      }
    }
  }
}


function viewTracks(trackId: string) {
  chrome.runtime.sendMessage({
    action: 'ACTIVATE'
  },
    response => {
      chrome.runtime.sendMessage({
        action: 'TRACK_VIEW',
        value: trackId ? trackId : 0
      }, () => { })
    })

}

export function removeTracks() {
  const tracks = document.querySelectorAll('div[id^="tuelloTrack"]');
  tracks.forEach(function (track) {
    track.remove();
  });
}


let recorderHttp = {

  originalXHR: window.XMLHttpRequest,
  recordXHR() {

    let xhrBody;
    let xhrMethod;
    // URL avant redirect
    let originalURL;
    const xhr = new recorderHttp.originalXHR();
    // tslint:disable-next-line:forin
    for (const attr in xhr) {

      if (attr === 'onreadystatechange') {
        xhr.onreadystatechange = (...args) => {
          if (this.readyState === 4) {
            if (!this.responseURL.includes('tuello')) {
              let reponse = '';
              try {
                reponse = JSON.parse(this.response);
              } catch (e) {
                // error
                reponse = this.response;
                console.log('Tuello : Problème de parsing de la reponse', e);
              }
              const url = originalURL.split('?')[0]
              httpElements.set(url, body);
            }
          }
          // tslint:disable-next-line:no-unused-expression
          this.onreadystatechange && this.onreadystatechange.apply(this, args);
        };
        continue;
      }

      if (typeof xhr[attr] === 'function') {
        if (attr === 'open') {
          const open = xhr[attr].bind(xhr);
          this[attr] = function (method, url) {
            xhrMethod = method;
            originalURL = url;
            open.call(this, method, url);
          }
        } else if (attr === 'send') {
          const send = xhr[attr].bind(xhr);
          this[attr] = function (data) {
            xhrBody = data;
            send.call(this, data);
          }
        } else {
          this[attr] = xhr[attr].bind(xhr);
        }
      } else {
        if (attr === 'responseText' || attr === 'response') {
          Object.defineProperty(this, attr, {
            get: () => (this[`_${attr}`] === undefined ? xhr[attr] : this[`_${attr}`]),
            set: val => (this[`_${attr}`] = val),
            enumerable: true,
          });
        } else {
          Object.defineProperty(this, attr, {
            get: () => xhr[attr],
            set: val => (xhr[attr] = val),
            enumerable: true,
          });
        }
      }
    }
  },
  originalFetch: window.fetch.bind(window),
  recordFetch: async (...args) => {

    const response = await recorderHttp.originalFetch(...args);

    httpElements.set(args[0], args[1] ? args[1].body : undefined,);
    /* the original response can be resolved unmodified: */
    return response;
  }
}
