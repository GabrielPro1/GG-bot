/**
 * Gestione dello stato "deposito in attesa" per il comando /deposita.
 *
 * Quando l'utente invia /deposita senza argomenti, il bot mostra le opzioni
 * e salva lo stato in questa mappa. Se l'utente scrive poi un importo
 * come messaggio normale (es. "100", "50%", "tutto", "1", "2", "3", "4"),
 * handler.js lo intercetta e lo processa come deposito.
 */
export const pendingDeposito = new Map();

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Selezione rapida numerica mostrata quando non si usano i bottoni interattivi.
 */
const QUICK_SELECT = {
    '1': '25%',
    '2': '50%',
    '3': '75%',
    '4': 'tutto',
};

/**
 * Analizza l'input dell'utente per un deposito.
 * Restituisce { amount } in caso di successo oppure { error }.
 */
export const parseDepositInput = (input, money) => {
    input = input.trim().toLowerCase();

    // Selezione rapida numerica (1=25%, 2=50%, 3=75%, 4=Tutto)
    if (QUICK_SELECT[input]) {
        input = QUICK_SELECT[input];
    }

    if (input === 'tutto') return { amount: money };
    if (input.endsWith('%')) {
        const percent = parseInt(input.replace('%', ''));
        if (isNaN(percent) || percent <= 0) {
            return { error: '𝐈𝐧𝐬𝐞𝐫𝐢𝐬𝐜𝐢 𝐮𝐧 𝐩𝐞𝐫𝐜𝐞𝐧𝐭𝐨 𝐯𝐚𝐥𝐢𝐝𝐨.' };
        }
        return { amount: Math.floor(money * percent / 100) };
    }
    if (!isNaN(input)) {
        const value = Number(input);
        if (value <= 0) {
            return { error: '𝐋\'𝐢𝐦𝐩𝐨𝐫𝐭𝐨 𝐝𝐞𝐯𝐞 𝐞𝐬𝐬𝐞𝐫𝐞 𝐦𝐚𝐠𝐠𝐢𝐨𝐫𝐞 𝐝𝐢 0.' };
        }
        return { amount: value };
    }
    return { error: '𝐀𝐬𝐬𝐞𝐠𝐠𝐢𝐫𝐚𝐭𝐢 𝐝𝐢 𝐢𝐧𝐬𝐞𝐫𝐢𝐫𝐞 𝐮𝐧 𝐧𝐮𝐦𝐞𝐫𝐨, 25%, 50%, 75% 𝐨 𝐭𝐮𝐭𝐭𝐨.' };
};

/**
 * Salva uno stato pending per un utente.
 */
export function setPending(userId, { chat, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const existing = pendingDeposito.get(userId);
    if (existing?.timeout) {
        clearTimeout(existing.timeout);
    }
    const timeout = setTimeout(() => {
        pendingDeposito.delete(userId);
    }, timeoutMs);
    pendingDeposito.set(userId, { chat, timeout });
}

/**
 * Rimuove lo stato pending di un utente.
 */
export function clearPending(userId) {
    const existing = pendingDeposito.get(userId);
    if (existing?.timeout) {
        clearTimeout(existing.timeout);
    }
    pendingDeposito.delete(userId);
}

/**
 * Restituisce lo stato pending di un utente, se presente.
 */
export function getPending(userId) {
    return pendingDeposito.get(userId);
}

/**
 * Verifica se un utente ha un deposito in attesa.
 */
export function hasPending(userId) {
    return pendingDeposito.has(userId);
}
