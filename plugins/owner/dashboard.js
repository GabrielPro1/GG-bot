import { formatBytes, formatCount, formatDuration, formatPercent } from '../../lib/dashboard/format.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

function whatsappLabel(state) {
    if (state === 'open')
        return '🟢 Connesso';
    if (state === 'connecting')
        return '🟡 Connessione…';
    if (state === 'qr')
        return '🟡 QR in attesa';
    if (state === 'close')
        return '🔴 Disconnesso';
    return '⚪ Sconosciuto';
}

function webLines(web) {
    if (web?.enabled) {
        return [
            `🌐 Dashboard web: ✅ attiva`,
            `🔗 ${web.url}`,
            web.authRequired ? '🔒 Accesso protetto da token' : '⚠️ Accesso solo locale (senza token)',
        ];
    }
    if (web?.reason === 'token_required') {
        return [
            '🌐 Dashboard web: ⚠️ disattivata',
            '🔑 Imposta DASHBOARD_TOKEN per l\'accesso in LAN',
        ];
    }
    if (web?.reason === 'listen_failed') {
        return [
            '🌐 Dashboard web: ❌ non avviata',
            '🔌 Controlla DASHBOARD_PORT e riavvia il bot',
        ];
    }
    return ['🌐 Dashboard web: ⚠️ non configurata'];
}

function renderError(message) {
    return [
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃    👑 DASHBOARD OWNER     ┃',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        message,
        '',
        SIGNATURE,
    ].join('\n');
}

export default {
    name: 'dashboard',
    category: 'owner',
    emoji: '👑',
    ownerOnly: true,
    description: 'Mostra statistiche, RAM e spazio disco del bot',
    execute: async ({ dashboard, reply }) => {
        if (!dashboard || typeof dashboard.getSnapshot !== 'function') {
            await reply(renderError('❌ Dashboard non disponibile in questo contesto.'));
            return;
        }
        let snapshot;
        try {
            snapshot = await dashboard.getSnapshot();
        }
        catch (error) {
            console.error('[dashboard] snapshot failed:', error);
            await reply(renderError('❌ Non riesco a leggere le statistiche del bot.'));
            return;
        }
        if (!snapshot) {
            await reply(renderError('❌ Dashboard non disponibile.'));
            return;
        }
        const bot = snapshot.bot;
        const memory = snapshot.memory;
        const disk = snapshot.disk;
        const storage = snapshot.storage;
        const cpu = snapshot.cpu;

        const lines = [
            '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
            '┃    👑 DASHBOARD OWNER     ┃',
            '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
            '',
            '🤖 *BOT*',
            `⏱️ Uptime: ${formatDuration(bot.uptimeSeconds)}`,
            `🔌 WhatsApp: ${whatsappLabel(bot.whatsapp?.state)}`,
            `🔗 Sessioni gestite: ${formatCount(bot.sessions.open)} aperte / ${formatCount(bot.sessions.total)}`,
            `📦 Comandi: ${formatCount(bot.commands)}`,
            `👥 Giocatori: ${formatCount(bot.players)} • Identità: ${formatCount(bot.identities)}`,
            `💬 Messaggi: ${formatCount(bot.messagesReceived)} • Comandi usati: ${formatCount(bot.commandsExecuted)}`,
            '',
            '🧠 *RAM*',
            `📊 Sistema: ${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)} (${formatPercent(memory.usagePercent)})`,
            `🆓 Libera: ${formatBytes(memory.freeBytes)}`,
            `🔹 Processo: ${formatBytes(memory.processRssBytes)}`,
            `🧮 Heap: ${formatBytes(memory.processHeapUsedBytes)} / ${formatBytes(memory.processHeapTotalBytes)}`,
            '',
            '💾 *DISCO*',
        ];

        if (disk.supported) {
            lines.push(
                `📦 Occupato: ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)} (${formatPercent(disk.usagePercent)})`,
                `🆓 Libero: ${formatBytes(disk.availableBytes)}`,
            );
        }
        else {
            lines.push('⚠️ Statistiche del disco non disponibili su questo sistema.');
        }
        lines.push(
            `🗄️ Database: ${formatBytes(storage.databaseBytes)}`,
            `🔐 Sessione auth: ${formatBytes(storage.authBytes)}`,
            '',
            '⚙️ *SISTEMA*',
            `🖥️ CPU: ${formatCount(cpu.cores)} core • carico ${(cpu.loadAverage?.[0] ?? 0).toFixed(2)}`,
            `🧩 Node ${bot.nodeVersion} • ${bot.platform} ${bot.arch}`,
            '',
            ...webLines(snapshot.web),
            '',
            '💡 Usa /dashboard per aggiornare',
            '',
            SIGNATURE,
        );

        await reply(lines.join('\n'));
    },
};
