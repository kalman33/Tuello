/** Fragment de texte issu d'une recherche : `match` marque la portion à surligner */
export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Découpe un texte autour de chaque occurrence de `query`, pour un surlignage
 * sans innerHTML. `query` est attendue déjà normalisée en minuscules.
 */
export function splitMatches(text: string, query: string): TextPart[] {
  if (!query || !text) {
    return [{ text, match: false }];
  }
  const parts: TextPart[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(query, i);
    if (idx === -1) {
      parts.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) {
      parts.push({ text: text.slice(i, idx), match: false });
    }
    parts.push({ text: text.slice(idx, idx + query.length), match: true });
    i = idx + query.length;
  }
  return parts;
}

/** URL du favicon d'un site, ou chaîne vide si l'URL n'est pas analysable */
export function faviconFor(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return '';
  }
}
