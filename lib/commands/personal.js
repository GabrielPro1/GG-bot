/**
 * Branch `personal`: comandi attivi per l'uso personale.
 *
 * Il loader registra solo i comandi elencati qui; gli altri file dentro
 * `plugins/` vengono ignorati. Per riattivare un comando basta aggiungere il
 * suo nome all'elenco.
 */
export const PERSONAL_COMMANDS = new Set([
    'menu',
    'sezione', // serve ai pulsanti di /menu
    'ping',
    'libri',
    'mandapag',
    'dashboard',
    'nuke',
    'mc',
]);
