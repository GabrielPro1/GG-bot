/**
 * Resolves the user targeted by a command, applying a single precedence rule:
 *
 *   mention  →  quoted  →  null
 *
 * A mention, if present, always wins over the quoted message's sender. When
 * neither a mention nor a quoted message exists, this returns null and the
 * caller keeps its own behavior for "no target".
 */
export function resolveTargetUser(mentions, quoted) {
    return mentions[0] ?? quoted;
}
