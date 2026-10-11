/**
 * État initial du navigateur dans l'export Playwright : quelles clés du stockage partent
 * dans le dépôt, et sous quelle forme.
 *
 * Un test qui démarre sur une page protégée a besoin de la preuve de connexion de
 * l'application (jeton dans le stockage, cookie). Le back-end étant bouchonné, une valeur
 * quelconque suffit souvent, mais elle ne doit ni expirer, ni exposer un vrai secret : chaque
 * clé peut être gardée, prolongée (jeton JWT), lue dans une variable d'environnement ou exclue.
 */
import { InitialState } from '../models/InitialState';

export type StateStore = 'localStorage' | 'sessionStorage' | 'cookies';

/**
 * - keep : valeur enregistrée, telle quelle
 * - extend : jetons JWT de la valeur réécrits avec une expiration lointaine
 * - env : valeur lue dans une variable d'environnement au lancement du test
 * - exclude : clé absente du test
 */
export type StateEntryMode = 'keep' | 'extend' | 'env' | 'exclude';

export interface StateEntry {
  store: StateStore;
  key: string;
  value: string;
  /** Nom ou valeur évoquant un secret : signalé à l'utilisateur */
  sensitive: boolean;
  /** La valeur contient au moins un jeton JWT portant une date d'expiration */
  hasExpiringJwt: boolean;
  mode: StateEntryMode;
  envName: string;
}

/** Valeur écrite dans fixtures/<scenario>.etat.json : texte, ou variable d'environnement */
export type StateFileValue = string | { env: string };

export interface StateFile {
  localStorage: Record<string, StateFileValue>;
  sessionStorage: Record<string, StateFileValue>;
  cookies: Record<string, StateFileValue>;
}

const SENSITIVE_KEY = /(token|auth|jwt|session|passw|secret|bearer|credential|api[-_]?key|\bsid\b|oidc|oauth)/i;

/** Jeton JWT : en-tête et contenu JSON encodés en base64url, puis signature */
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

/** Expiration donnée aux jetons prolongés */
const EXTENDED_LIFETIME_YEARS = 10;

function decodeSegment(segment: string): string {
  const base64 = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function encodeSegment(text: string): string {
  let binary = '';
  new TextEncoder().encode(text).forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwtPayload(token: string): { exp?: unknown } | null {
  try {
    const payload = JSON.parse(decodeSegment(token.split('.')[1]));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function hasExpiringJwt(value: string): boolean {
  return (value.match(JWT_PATTERN) ?? []).some((token) => typeof jwtPayload(token)?.exp === 'number');
}

/**
 * Réécrit l'expiration de chaque jeton JWT de la valeur (y compris dans un JSON).
 * La signature n'est plus valide, ce qui ne gêne pas : le front ne la vérifie pas, et
 * le back-end qui le ferait est remplacé par les bouchons.
 */
export function extendJwts(value: string, now = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + EXTENDED_LIFETIME_YEARS * 365 * 24 * 3600;
  return value.replace(JWT_PATTERN, (token) => {
    const payload = jwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') {
      return token;
    }
    const [header, , signature] = token.split('.');
    return `${header}.${encodeSegment(JSON.stringify({ ...payload, exp }))}.${signature}`;
  });
}

function envName(key: string): string {
  const name = key
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `E2E_${name || 'VALEUR'}`;
}

/** Clés de l'état initial, avec le traitement proposé par défaut */
export function listStateEntries(state: InitialState | undefined): StateEntry[] {
  if (!state) {
    return [];
  }
  const entries: StateEntry[] = [];
  for (const store of ['localStorage', 'sessionStorage', 'cookies'] as StateStore[]) {
    for (const [key, value] of Object.entries(state[store] ?? {})) {
      const expiring = hasExpiringJwt(value ?? '');
      entries.push({
        store,
        key,
        value: value ?? '',
        sensitive: SENSITIVE_KEY.test(key) || JWT_PATTERN.test(value ?? ''),
        hasExpiringJwt: expiring,
        // Un jeton qui expire ferait échouer le test quelques heures après l'export
        mode: expiring ? 'extend' : 'keep',
        envName: envName(key)
      });
      // JWT_PATTERN est global : test() avance lastIndex, à remettre à zéro
      JWT_PATTERN.lastIndex = 0;
    }
  }
  return entries;
}

/** Contenu de fixtures/<scenario>.etat.json, ou null s'il n'y a rien à restaurer */
export function buildStateFile(entries: StateEntry[], now = new Date()): StateFile | null {
  const file: StateFile = { localStorage: {}, sessionStorage: {}, cookies: {} };
  let count = 0;
  for (const entry of entries) {
    if (entry.mode === 'exclude') {
      continue;
    }
    file[entry.store][entry.key] = entry.mode === 'env' ? { env: entry.envName } : entry.mode === 'extend' ? extendJwts(entry.value, now) : entry.value;
    count++;
  }
  return count > 0 ? file : null;
}
