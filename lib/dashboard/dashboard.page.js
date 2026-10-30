export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>GG Bot · Dashboard Owner</title>
<style>
:root {
    color-scheme: dark;
    --bg: #080b12;
    --panel: #111722;
    --panel-2: #0d121b;
    --line: #263044;
    --text: #f5f7fb;
    --muted: #93a0b5;
    --accent: #42e3a5;
    --accent-2: #5aa7ff;
    --warn: #ffc857;
    --danger: #ff6b7a;
}
* { box-sizing: border-box; }
html, body { min-height: 100%; }
body {
    margin: 0;
    background:
        radial-gradient(circle at 10% 0%, rgba(66, 227, 165, .12), transparent 35rem),
        radial-gradient(circle at 95% 10%, rgba(90, 167, 255, .12), transparent 30rem),
        var(--bg);
    color: var(--text);
    font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
}
.shell { width: min(1180px, 100%); margin: 0 auto; padding: 28px 18px 46px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: .2em; }
h1 { margin: 0; font-size: clamp(26px, 5vw, 44px); letter-spacing: -.04em; }
h2 { margin: 0; font-size: 17px; }
.status {
    display: inline-flex; align-items: center; gap: 8px;
    border: 1px solid var(--line); border-radius: 999px;
    padding: 8px 13px; background: rgba(17, 23, 34, .82);
    color: var(--muted); font-size: 13px; white-space: nowrap;
}
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); box-shadow: 0 0 0 4px rgba(147, 160, 181, .12); }
.dot.ok { background: var(--accent); box-shadow: 0 0 0 4px rgba(66, 227, 165, .14); }
.dot.bad { background: var(--danger); box-shadow: 0 0 0 4px rgba(255, 107, 122, .14); }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.card {
    border: 1px solid var(--line); border-radius: 20px;
    background: linear-gradient(160deg, rgba(20, 28, 42, .96), rgba(13, 18, 27, .96));
    padding: 20px; box-shadow: 0 22px 60px rgba(0, 0, 0, .2);
}
.card.wide { grid-column: 1 / -1; }
.card-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.card-title > span { font-size: 20px; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metrics > div { min-width: 0; padding: 12px; border-radius: 14px; background: rgba(8, 11, 18, .52); border: 1px solid rgba(38, 48, 68, .72); }
.label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .09em; }
.metrics strong { font-size: 19px; overflow-wrap: anywhere; }
.big { margin-top: 4px; font-size: 31px; font-weight: 800; letter-spacing: -.035em; }
.muted { margin-top: 3px; color: var(--muted); font-size: 13px; }
.bar { height: 9px; margin: 16px 0; overflow: hidden; border-radius: 999px; background: #1b2433; }
.bar > span { display: block; width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-2)); transition: width .35s ease; }
.row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 7px 0; border-top: 1px solid rgba(38, 48, 68, .52); font-size: 14px; }
.row:first-of-type { border-top: 0; }
.row span { color: var(--muted); }
.row strong { text-align: right; overflow-wrap: anywhere; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; color: var(--muted); font-size: 12px; }
button {
    border: 1px solid rgba(66, 227, 165, .42); border-radius: 12px;
    padding: 10px 15px; cursor: pointer;
    background: rgba(66, 227, 165, .12); color: var(--accent);
    font: inherit; font-weight: 700;
}
button:hover { background: rgba(66, 227, 165, .2); }
.login {
    max-width: 520px; margin: 10vh auto 0; padding: 26px;
    border: 1px solid var(--line); border-radius: 22px;
    background: linear-gradient(160deg, rgba(20, 28, 42, .98), rgba(13, 18, 27, .98));
    box-shadow: 0 28px 80px rgba(0, 0, 0, .3);
}
.login p { color: var(--muted); line-height: 1.55; }
.login form { display: flex; gap: 10px; margin-top: 18px; }
.login input {
    min-width: 0; flex: 1; border: 1px solid var(--line); border-radius: 12px;
    padding: 12px 13px; background: #0a0e15; color: var(--text); font: inherit;
    outline: none;
}
.login input:focus { border-color: var(--accent-2); box-shadow: 0 0 0 3px rgba(90, 167, 255, .14); }
.error { min-height: 20px; color: var(--danger) !important; font-size: 13px; }
@media (max-width: 820px) {
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 660px) {
    .shell { padding: 20px 12px 38px; }
    .topbar { align-items: flex-start; flex-direction: column; }
    .grid { grid-template-columns: 1fr; }
    .card.wide { grid-column: auto; }
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .login form { flex-direction: column; }
}
</style>
</head>
<body>
<main class="shell">
    <header class="topbar">
        <div>
            <p class="eyebrow">GG BOT</p>
            <h1>Dashboard Owner</h1>
        </div>
        <div class="status"><span class="dot" id="status-dot"></span><span id="status-text">Connessione…</span></div>
    </header>

    <section class="login" id="login" hidden>
        <h2>Accesso owner</h2>
        <p>Inserisci il token configurato in <strong>DASHBOARD_TOKEN</strong> per vedere le statistiche.</p>
        <form id="login-form">
            <input id="token" type="password" placeholder="Token dashboard" autocomplete="current-password" required>
            <button type="submit">Entra</button>
        </form>
        <p class="error" id="login-error"></p>
    </section>

    <section id="dashboard" hidden>
        <div class="grid">
            <article class="card wide">
                <div class="card-title"><span>🤖</span><h2>Bot</h2></div>
                <div class="metrics">
                    <div><span class="label">Uptime</span><strong id="uptime">—</strong></div>
                    <div><span class="label">WhatsApp</span><strong id="wa-state">—</strong></div>
                    <div><span class="label">Sessioni gestite</span><strong id="sessions">—</strong></div>
                    <div><span class="label">Comandi</span><strong id="commands">—</strong></div>
                    <div><span class="label">Giocatori</span><strong id="players">—</strong></div>
                    <div><span class="label">Identità</span><strong id="identities">—</strong></div>
                    <div><span class="label">Messaggi</span><strong id="messages">—</strong></div>
                    <div><span class="label">Comandi usati</span><strong id="commands-used">—</strong></div>
                </div>
            </article>

            <article class="card">
                <div class="card-title"><span>🧠</span><h2>RAM</h2></div>
                <div class="big" id="ram-used">—</div>
                <div class="muted" id="ram-total">—</div>
                <div class="bar"><span id="ram-bar"></span></div>
                <div class="row"><span>Libera</span><strong id="ram-free">—</strong></div>
                <div class="row"><span>Processo (RSS)</span><strong id="ram-rss">—</strong></div>
                <div class="row"><span>Heap</span><strong id="ram-heap">—</strong></div>
            </article>

            <article class="card">
                <div class="card-title"><span>💾</span><h2>Disco</h2></div>
                <div class="big" id="disk-used">—</div>
                <div class="muted" id="disk-total">—</div>
                <div class="bar"><span id="disk-bar"></span></div>
                <div class="row"><span>Libero</span><strong id="disk-free">—</strong></div>
                <div class="row"><span>Database</span><strong id="db-size">—</strong></div>
                <div class="row"><span>Sessione auth</span><strong id="auth-size">—</strong></div>
            </article>

            <article class="card">
                <div class="card-title"><span>⚙️</span><h2>Sistema</h2></div>
                <div class="row"><span>CPU</span><strong id="cpu-cores">—</strong></div>
                <div class="row"><span>Modello</span><strong id="cpu-model">—</strong></div>
                <div class="row"><span>Carico 1m</span><strong id="cpu-load">—</strong></div>
                <div class="row"><span>Node</span><strong id="node-version">—</strong></div>
                <div class="row"><span>Piattaforma</span><strong id="platform">—</strong></div>
                <div class="row"><span>PID</span><strong id="pid">—</strong></div>
            </article>

            <article class="card wide">
                <div class="card-title"><span>🌐</span><h2>Dashboard web</h2></div>
                <div class="row"><span>Stato</span><strong id="web-state">—</strong></div>
                <div class="row"><span>Indirizzo</span><strong id="web-url">—</strong></div>
            </article>
        </div>
        <footer>
            <span id="updated">—</span>
            <button id="refresh" type="button">Aggiorna</button>
        </footer>
    </section>
</main>
<script>
(function () {
    'use strict';
    var STORAGE_KEY = 'gg-dashboard-token';
    var login = document.getElementById('login');
    var dashboard = document.getElementById('dashboard');
    var loginForm = document.getElementById('login-form');
    var tokenInput = document.getElementById('token');
    var refreshButton = document.getElementById('refresh');

    function setText(id, value) {
        var element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function setStatus(ok, text) {
        var dot = document.getElementById('status-dot');
        if (dot) {
            dot.className = 'dot ' + (ok ? 'ok' : 'bad');
        }
        setText('status-text', text);
    }

    function showLogin(message) {
        dashboard.hidden = true;
        login.hidden = false;
        setText('login-error', message || '');
        tokenInput.focus();
    }

    function showDashboard() {
        login.hidden = true;
        dashboard.hidden = false;
    }

    function formatBytes(bytes) {
        var value = Number(bytes);
        var units = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (!isFinite(value) || value <= 0) {
            return '0 B';
        }
        var exponent = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
        var scaled = value / Math.pow(1024, exponent);
        var decimals = exponent === 0 ? 0 : 1;
        return scaled.toFixed(decimals).replace('.', ',') + ' ' + units[exponent];
    }

    function formatDuration(seconds) {
        var total = Math.max(0, Math.floor(Number(seconds) || 0));
        var days = Math.floor(total / 86400);
        var hours = Math.floor((total % 86400) / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        var remaining = total % 60;
        if (days > 0) return days + 'g ' + hours + 'h';
        if (hours > 0) return hours + 'h ' + minutes + 'm';
        if (minutes > 0) return minutes + 'm ' + remaining + 's';
        return remaining + 's';
    }

    function formatPercent(value) {
        var number = Number(value);
        if (!isFinite(number)) number = 0;
        return number.toFixed(0) + '%';
    }

    function formatCount(value) {
        return Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString('it-IT');
    }

    function setBar(id, percent) {
        var bar = document.getElementById(id);
        if (!bar) return;
        var value = Number(percent);
        if (!isFinite(value)) value = 0;
        bar.style.width = Math.max(0, Math.min(100, value)) + '%';
    }

    function whatsappLabel(state) {
        if (state === 'open') return 'Connesso';
        if (state === 'connecting') return 'Connessione…';
        if (state === 'qr') return 'QR in attesa';
        if (state === 'close') return 'Disconnesso';
        return 'Sconosciuto';
    }

    function render(data) {
        var bot = data.bot || {};
        var memory = data.memory || {};
        var disk = data.disk || {};
        var storage = data.storage || {};
        var cpu = data.cpu || {};
        var web = data.web || {};
        var sessions = bot.sessions || {};

        setText('uptime', formatDuration(bot.uptimeSeconds));
        setText('wa-state', whatsappLabel(bot.whatsapp && bot.whatsapp.state));
        setText('sessions', formatCount(sessions.open) + ' / ' + formatCount(sessions.total));
        setText('commands', formatCount(bot.commands));
        setText('players', formatCount(bot.players));
        setText('identities', formatCount(bot.identities));
        setText('messages', formatCount(bot.messagesReceived));
        setText('commands-used', formatCount(bot.commandsExecuted));

        setText('ram-used', formatBytes(memory.usedBytes) + ' in uso');
        setText('ram-total', 'su ' + formatBytes(memory.totalBytes) + ' (' + formatPercent(memory.usagePercent) + ')');
        setText('ram-free', formatBytes(memory.freeBytes));
        setText('ram-rss', formatBytes(memory.processRssBytes));
        setText('ram-heap', formatBytes(memory.processHeapUsedBytes) + ' / ' + formatBytes(memory.processHeapTotalBytes));
        setBar('ram-bar', memory.usagePercent);

        if (disk.supported) {
            setText('disk-used', formatBytes(disk.usedBytes) + ' occupati');
            setText('disk-total', 'su ' + formatBytes(disk.totalBytes) + ' (' + formatPercent(disk.usagePercent) + ')');
            setText('disk-free', formatBytes(disk.availableBytes));
            setBar('disk-bar', disk.usagePercent);
        }
        else {
            setText('disk-used', 'Non disponibile');
            setText('disk-total', disk.path || '');
            setText('disk-free', '—');
            setBar('disk-bar', 0);
        }
        setText('db-size', formatBytes(storage.databaseBytes));
        setText('auth-size', formatBytes(storage.authBytes));

        setText('cpu-cores', formatCount(cpu.cores) + ' core');
        setText('cpu-model', cpu.model || 'Sconosciuta');
        setText('cpu-load', Number(cpu.loadAverage && cpu.loadAverage[0] ? cpu.loadAverage[0] : 0).toFixed(2));
        setText('node-version', bot.nodeVersion || '—');
        setText('platform', (bot.platform || '—') + ' ' + (bot.arch || ''));
        setText('pid', bot.pid || '—');

        if (web.enabled) {
            setText('web-state', web.authRequired ? 'Attiva · protetta da token' : 'Attiva · solo locale');
            setText('web-url', web.url || '—');
        }
        else {
            setText('web-state', web.reason === 'token_required' ? 'Disattivata · serve DASHBOARD_TOKEN' : 'Disattivata');
            setText('web-url', '—');
        }

        setText('updated', 'Aggiornata: ' + new Date(data.generatedAt).toLocaleString('it-IT'));
        setStatus(true, 'Online');
        showDashboard();
    }

    async function load() {
        var token = sessionStorage.getItem(STORAGE_KEY);
        var headers = {};
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }
        try {
            var response = await fetch('/api/stats', { headers: headers, cache: 'no-store' });
            if (response.status === 401) {
                sessionStorage.removeItem(STORAGE_KEY);
                setStatus(false, 'Accesso richiesto');
                showLogin(token ? 'Token non valido. Riprova.' : '');
                return;
            }
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            render(await response.json());
        }
        catch (error) {
            setStatus(false, 'Errore di connessione');
            if (!dashboard.hidden) {
                setText('updated', 'Ultimo aggiornamento non riuscito');
            }
        }
    }

    loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var token = tokenInput.value.trim();
        if (!token) return;
        sessionStorage.setItem(STORAGE_KEY, token);
        tokenInput.value = '';
        setText('login-error', '');
        setStatus(true, 'Connessione…');
        load();
    });

    refreshButton.addEventListener('click', load);
    window.setInterval(function () {
        if (!dashboard.hidden) load();
    }, 5000);

    load();
})();
</script>
</body>
</html>`;
