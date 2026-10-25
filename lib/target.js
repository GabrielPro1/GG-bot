/**
 * Risolve l'utente bersaglio di un comando, applicando un'unica regola di precedenza:
 *
 *   mention  →  quoted  →  null
 *
 * Una mention, se presente, ha sempre la priorità sul mittente del messaggio
 * quotato. Quando non ci sono né mention né messaggio quotato, ritorna null e il
 * chiamante mantiene il suo comportamento per "nessun bersaglio".
 */
export function resolveTargetUser(mentions, quoted) {
    return mentions[0] ?? quoted;
}
