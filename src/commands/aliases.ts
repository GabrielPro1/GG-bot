/**
 * ALIAS DEI COMANDI — UNICA FONTE DI VERITÀ
 * ===========================================
 *
 * Qui si definiscono TUTTI gli alias aggiuntivi dei comandi del bot.
 * Il nome principale di ogni comando rimane quello dichiarato dal comando
 * stesso (es. `negozio`), questo file aggiunge SOLO i sinonimi.
 *
 * COME AGGIUNGERE UN ALIAS
 * ------------------------
 * 1. Apri questo file:  src/commands/aliases.ts
 * 2. Trova il comando a cui vuoi aggiungere l'alias
 * 3. Aggiungi l'alias nell'array (ogni voce è un comando /alias)
 * 4. Salva
 * 5. Riavvia il bot
 *
 * Esempio:
 *   negozio: ['shop', 'store']
 * fa funzionare:  /negozio  /shop  /store
 *
 * COME RIMUOVERE UN ALIAS
 * -----------------------
 * Basta togliere la voce dall'array (o svuotare l'array con  [] ).
 * Non serve modificare il file del comando.
 *
 * NOTE
 * ----
 * - Gli alias devono essere UNA singola parola (niente spazi): il dispatcher
 *   riconosce come nome comando solo la prima parola del messaggio.
 *   Alias multi-parola (es. 'exit chat') NON sono supportati.
 * - Gli alias NON fanno distinzione maiuscole/minuscole: /Shop = /shop.
 * - Se lo stesso alias compare in due comandi diversi, l'avvio del bot
 *   segnala un errore di conflitto e mantiene il comando precedente.
 * - Gli alias duplicati all'interno dello stesso array vengono ignorati.
 */

export type CommandAliasesMap = Readonly<Record<string, readonly string[]>>;

export const COMMAND_ALIASES: CommandAliasesMap = {
  ai: ['gemini'],
  aggiungimonete: ['addcoins', 'daimonete'],
  rimuovimonete: ['rmcoins', 'togliamonete'],
  acquista: ['buy'],
  combatti: ['fight'],
  inventario: ['inv', 'bag'],
  negozio: ['shop'],
  portafoglio: ['wallet'],
  ruba: ['rapina', 'steal'],
};
