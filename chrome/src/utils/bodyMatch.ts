/**
 * Mocks conditionnés par le body de la requête (`bodyMatch`).
 *
 * Plusieurs mocks peuvent partager la même URL et la même méthode (typiquement un
 * POST) : chacun porte alors un JSON partiel, et ne répond que si le body envoyé
 * contient au moins ces valeurs. Un mock sans condition sert de cas par défaut.
 *
 * Règles de comparaison (bodyMatches) :
 *  - objet : chaque clé de la condition doit exister dans le body et correspondre
 *    récursivement ; les clés du body absentes de la condition sont ignorées ;
 *  - tableau : chaque élément de la condition doit correspondre à au moins un
 *    élément du tableau envoyé, quel que soit l'ordre ;
 *  - valeur simple : égalité stricte (un champ de formulaire est toujours une chaîne).
 *
 * Module sans dépendance au DOM ni à chrome.* : partagé par httpmanager (rejeu),
 * le service worker (dédoublonnage à l'enregistrement) et l'interface Angular.
 * La librairie exportée (exportTuelloTemplate.ts), autonome, en embarque une copie.
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Nombre de critères d'une condition : sert à départager plusieurs mocks dont la
 * condition est satisfaite (le plus précis gagne). Une condition vide ({}, null,
 * absente) vaut 0 et ne conditionne rien : le mock est un mock « par défaut ».
 * Un objet ou tableau vide imbriqué compte pour un critère (il exige le type).
 */
export const bodyMatchWeight = (condition: unknown, isRoot = true): number => {
  if (condition === undefined) return 0;
  if (Array.isArray(condition)) {
    if (condition.length === 0) return isRoot ? 0 : 1;
    return condition.reduce((sum: number, item) => sum + bodyMatchWeight(item, false), 0);
  }
  if (isPlainObject(condition)) {
    const keys = Object.keys(condition);
    if (keys.length === 0) return isRoot ? 0 : 1;
    return keys.reduce((sum, key) => sum + bodyMatchWeight(condition[key], false), 0);
  }
  // null à la racine = pas de condition ; imbriqué, il exige une valeur null
  if (condition === null) return isRoot ? 0 : 1;
  return 1;
};

/** Le body envoyé contient-il au moins les valeurs de la condition ? */
export const bodyMatches = (actual: unknown, expected: unknown): boolean => {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem) => actual.some((actualItem) => bodyMatches(actualItem, expectedItem)));
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) return false;
    return Object.keys(expected).every((key) => Object.prototype.hasOwnProperty.call(actual, key) && bodyMatches(actual[key], expected[key]));
  }
  return actual === expected;
};

// Corps "a=1&b=2" (formulaire encodé, jQuery...) : au moins une paire clé=valeur, sans espace
const FORM_URLENCODED_PATTERN = /^[^=&\s]+=[^&\s]*(?:&[^=&\s]+=[^&\s]*)*$/;

/** Paires clé/valeur → objet ; une clé répétée devient un tableau. */
const entriesToObject = (entries: [string, unknown][]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = value;
    } else if (Array.isArray(result[key])) {
      (result[key] as unknown[]).push(value);
    } else {
      result[key] = [result[key], value];
    }
  }
  return result;
};

// forEach plutôt que entries() : le tsconfig de l'extension n'inclut pas dom.iterable
const searchParamsToObject = (params: URLSearchParams): Record<string, unknown> => {
  const entries: [string, unknown][] = [];
  params.forEach((value, key) => entries.push([key, value]));
  return entriesToObject(entries);
};

/**
 * Convertit le body d'une requête en valeur comparable, sans lecture asynchrone :
 * JSON en chaîne, formulaire encodé (chaîne ou URLSearchParams), FormData (champs
 * texte uniquement). Retourne undefined pour un body illisible ici (Blob, ArrayBuffer,
 * flux...) : seuls les mocks sans condition peuvent alors répondre.
 */
export const parseRequestBody = (body: unknown): unknown => {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      // Pas du JSON : formulaire encodé ou texte brut
    }
    if (FORM_URLENCODED_PATTERN.test(trimmed)) {
      try {
        return searchParamsToObject(new URLSearchParams(trimmed));
      } catch {
        return body;
      }
    }
    return body;
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return searchParamsToObject(body);
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const textEntries: [string, unknown][] = [];
    body.forEach((value, key) => {
      if (typeof value === 'string') textEntries.push([key, value]);
    });
    return entriesToObject(textEntries);
  }
  return undefined;
};

/** Sérialisation à clés triées : {a,b} et {b,a} donnent la même chaîne. */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 'null' : serialized;
};

/** Clé de la condition d'un mock ('' si aucune condition effective). */
export const bodyConditionKey = (condition: unknown): string => (bodyMatchWeight(condition) === 0 ? '' : stableStringify(condition));

/**
 * Clé d'unicité d'un mock : méthode + URL, plus la condition sur le body s'il y en a une.
 * Les mocks sans condition (dont tous les enregistrements antérieurs) gardent exactement
 * la clé historique et restent donc dédoublonnés comme avant ; deux mocks d'une même URL
 * avec des conditions différentes ne s'écrasent plus.
 */
export const mockDuplicateKey = (item: { key: string; method?: string; bodyMatch?: unknown }): string => {
  const base = `${(item.method || '').toUpperCase()} ${item.key}`;
  const condition = bodyConditionKey(item.bodyMatch);
  return condition ? `${base} ${condition}` : base;
};
