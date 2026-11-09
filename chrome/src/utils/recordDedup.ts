/**
 * Filtre des messages RECORD_HTTP déjà vus, par requestId.
 *
 * httpmanager.js rejoue sa file de boot à l'activation d'un consommateur ; une requête
 * terminée juste à ce moment peut arriver deux fois (une fois en direct, une fois rejouée).
 * Retourne true la première fois qu'un requestId est présenté, false ensuite. Un message
 * sans requestId passe toujours.
 */
const MAX_SEEN = 1000;

export function createFirstSeenFilter(): (requestId: unknown) => boolean {
  let seen = new Set<string>();
  return (requestId: unknown): boolean => {
    if (typeof requestId !== 'string' || !requestId) return true;
    if (seen.has(requestId)) return false;
    // Borne mémoire : un doublon n'arrive qu'à quelques millisecondes d'écart
    if (seen.size >= MAX_SEEN) seen = new Set<string>();
    seen.add(requestId);
    return true;
  };
}
