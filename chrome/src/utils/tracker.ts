import { Track } from '../models/Track';
import { TrackType } from '../models/TrackType';
import { UserAction } from '../models/UserAction';
import { clickInside, getElementFromXPath, getXPath, isFixedPosition, isVisible, removeURLPort, removeURLPortAndQueryString } from './utils';

let lastUserAction: UserAction;
let performanceObserver;

let tuelloTracks;

let bodyObserver;
let resizeObserver;
let timer;
const debounceTimer = 300;

const mutationOptions = {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
  attributeOldValue: false,
  characterDataOldValue: false
};

export function activateRecordTracks() {

  displayTracks(null, null);

  // on observe les événements de mesure des performances de type resource
  if (!performanceObserver) {
    // @ts-ignore
    performanceObserver = new PerformanceObserver(recordListener);
    performanceObserver.observe({ type: "resource", buffered: true });
    // on active le listener pour le click souris
    document.removeEventListener('click', clickListener);
    document.addEventListener('click', clickListener);

    if (bodyObserver) {
      bodyObserver.disconnect();
    }
    bodyObserver = new MutationObserver(displayTracks);
    bodyObserver.observe(document.body, mutationOptions);

    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    resizeObserver = new ResizeObserver(displayTracks);
    resizeObserver.observe(document.body);

  }


}

export function desactivateRecordTracks() {
  if (performanceObserver) {
    performanceObserver.disconnect();
    performanceObserver = undefined;

  }
  document.removeEventListener('click', clickListener);
  removeTracks();
  bodyObserver.disconnect();
  resizeObserver.disconnect();
}

async function displayTracks(mutationsList, observer) {
  let modifiedNode = false;
  if (mutationsList) {
    mutationsList.forEach(mutation => {
      if (mutation.addedNodes) {
        mutation.addedNodes.forEach(node => {
          const htmlElt = (node as HTMLElement);
          if ((!htmlElt.id || typeof htmlElt.id !== 'string' || !htmlElt.id.includes('tuello')) && (!htmlElt.className || typeof htmlElt.className !== 'string' || !htmlElt.className.includes('tuello'))) {
            modifiedNode = true;
          }
        });
      } else if (mutation.deletedNodes) {
        mutation.deletedNodes.forEach(node => {
          const htmlElt = (node as HTMLElement);
          if ((!htmlElt.id || typeof htmlElt.id !== 'string' || !htmlElt.id.includes('tuello')) && (!htmlElt.className || typeof htmlElt.className !== 'string' || !htmlElt.className.includes('tuello'))) {
            modifiedNode = true;
          }
        });
      } else {
        modifiedNode = true;
      }
    });
  } else {
    modifiedNode = true;
  }

  if (modifiedNode) {
    // on ne réexecute le code que tous les "debounceTimer"
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      
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
    }, debounceTimer);

  }
}

async function getTuelloTracks() {
  await new Promise((resolve, reject) => {
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
    chrome.storage.local.get(['tuelloTrackData', 'tuelloTrackDataDisplayType'], results => {
      let trackData = results['tuelloTrackData'];
      const tuelloTrackDataDisplayType = results['tuelloTrackDataDisplayType'];
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

        //if (tuelloTrackDataDisplayType === 'body') {
        findBodyElement(track.url).then((body) => track.body = body).catch(e => { })
        //}

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
        const elementList = trackElement?.children;
       
        // mouse over : on affiche un contour sur le lien ou le bouton
        elt.onmouseenter = (event) => {
          trackElement.classList.add('tuello-background-color');
          trackElement.classList.add('tuello-white-texte');
          if (elementList) {
            for (var i = 0; i < elementList.length; i++) {
              elementList[i].classList.add('tuello-white-texte');
            }
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
        value: {
          trackId: trackId ? trackId : 0, 
          currentHrefLocation: window.location.href
        }
      }, () => { })
    })

}

function findBodyElement(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['tuelloTracksBody'], results => {
      if (!chrome.runtime.lastError) {
        const bodies = results['tuelloTracksBody'] || [];
        const record = bodies.find(({ key, body }) => compareUrl(url, key));
        if (record) {
          resolve(record.body);
        } else {
          reject(null);
        }
      } else {
        reject(null);
      }
    });
  });

}


export function removeTracks() {
  const tracks = document.querySelectorAll('div[id^="tuelloTrack"]');
  tracks.forEach(function (track) {
    track.remove();
  });
}

function compareUrl(url1: string, url2: string): boolean {
  url1 = removeURLPortAndQueryString(url1);
  url2 = removeURLPortAndQueryString(url2);
  return new RegExp('^' + url2.replaceAll(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replaceAll('*', '(.*)') + '$').test(url1);
}

