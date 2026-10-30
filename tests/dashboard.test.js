import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardService } from '../lib/dashboard/dashboard.service.js';
import { startDashboardServer } from '../lib/dashboard/dashboard.server.js';
import { formatBytes, formatCount, formatDuration, formatPercent } from '../lib/dashboard/format.js';
import dashboardCommand from '../plugins/owner/dashboard.js';
import { PlayerRepository } from '../lib/rpg/player.repository.js';
import { RpgService } from '../lib/rpg/rpg.service.js';
import { IdentityService } from '../lib/identity/identity.service.js';
import { createTestDb, insertTestIdentity } from './helpers.js';

const UID_1 = 'dashboard-user-1';
const UID_2 = 'dashboard-user-2';

function makeSnapshot(overrides = {}) {
    return {
        generatedAt: '2026-10-30T12:00:00.000Z',
        bot: {
            name: 'GG Bot',
            uptimeSeconds: 90_061,
            startedAt: '2026-10-29T10:59:59.000Z',
            nodeVersion: 'v22.22.3',
            platform: 'win32',
            arch: 'x64',
            pid: 1234,
            commands: 42,
            identities: 7,
            players: 5,
            aiChats: 3,
            aiMessages: 12,
            messagesReceived: 321,
            commandsExecuted: 45,
            chatXpAwards: 120,
            chatXpTotal: 1800,
            sessions: { total: 2, open: 1, connecting: 1, closed: 0 },
            whatsapp: { state: 'open', updatedAt: '2026-10-30T11:59:00.000Z' },
            ...(overrides.bot ?? {}),
        },
        memory: {
            totalBytes: 8 * 1024 ** 3,
            freeBytes: 5 * 1024 ** 3,
            usedBytes: 3 * 1024 ** 3,
            usagePercent: 37.5,
            processRssBytes: 80 * 1024 ** 2,
            processHeapUsedBytes: 24 * 1024 ** 2,
            processHeapTotalBytes: 32 * 1024 ** 2,
            processExternalBytes: 4 * 1024 ** 2,
            ...(overrides.memory ?? {}),
        },
        disk: {
            supported: true,
            path: '/project',
            totalBytes: 256 * 1024 ** 3,
            usedBytes: 120 * 1024 ** 3,
            freeBytes: 136 * 1024 ** 3,
            availableBytes: 136 * 1024 ** 3,
            usagePercent: 46.875,
            ...(overrides.disk ?? {}),
        },
        storage: {
            databaseBytes: 1024 ** 2,
            authBytes: 2 * 1024 ** 2,
            totalBytes: 3 * 1024 ** 2,
            ...(overrides.storage ?? {}),
        },
        cpu: {
            cores: 8,
            model: 'Test CPU',
            loadAverage: [0.5, 0.4, 0.3],
            usagePercent: 6.25,
            ...(overrides.cpu ?? {}),
        },
        web: {
            enabled: true,
            authRequired: true,
            url: 'http://127.0.0.1:3000',
            reason: null,
            ...(overrides.web ?? {}),
        },
    };
}

function makeDashboardView(snapshot, web = snapshot.web) {
    return {
        getSnapshot: async () => snapshot,
        getWebInfo: () => web,
    };
}

async function runDashboardCommand(view) {
    const replies = [];
    await dashboardCommand.execute({
        dashboard: view,
        reply: async (text) => replies.push(text),
    });
    return replies.join('\n');
}

describe('Formattazione dashboard', () => {
    it('formatta byte, percentuali, durate e conteggi', () => {
        assert.equal(formatBytes(0), '0 B');
        assert.equal(formatBytes(1024), '1,0 KB');
        assert.equal(formatBytes(1536), '1,5 KB');
        assert.equal(formatBytes(5 * 1024 ** 3), '5,0 GB');
        assert.equal(formatPercent(46.875), '47%');
        assert.equal(formatPercent(46.875, 1), '46,9%');
        assert.equal(formatDuration(45), '45s');
        assert.equal(formatDuration(3_600 + 12 * 60), '1h 12m');
        assert.equal(formatDuration(90_061), '1g 1h');
        assert.equal(formatCount(1234567), '1.234.567');
    });
});

describe('DashboardService', () => {
    let db;
    let directory;
    let service;

    beforeEach(() => {
        db = createTestDb();
        insertTestIdentity(db, UID_1);
        insertTestIdentity(db, UID_2);
        const rpg = new RpgService(new PlayerRepository(db));
        rpg.getOrCreatePlayer(UID_1);
        rpg.getOrCreatePlayer(UID_2);
        directory = mkdtempSync(join(tmpdir(), 'gg-dashboard-'));
        const dbPath = join(directory, 'gg-bot.db');
        const authRoot = join(directory, 'auth');
        mkdirSync(authRoot, { recursive: true });
        writeFileSync(dbPath, Buffer.alloc(2048));
        writeFileSync(join(authRoot, 'creds.json'), Buffer.alloc(1024));
        service = new DashboardService({
            db,
            rpg,
            identityService: new IdentityService({}, db),
            registry: { getAll: () => [{}, {}, {}] },
            projectRoot: directory,
            dbPath,
            authRoot,
            startedAt: Date.now() - 90_000,
        });
        service.setSessionManager({
            listSessions: () => [{ state: 'open' }, { state: 'connecting' }, { state: 'close' }],
        });
    });

    afterEach(() => {
        db.close();
        rmSync(directory, { recursive: true, force: true });
    });

    it('raccoglie statistiche del bot, memoria, disco e spazio occupato', async () => {
        const snapshot = await service.getSnapshot();

        assert.equal(snapshot.bot.name, 'GG Bot');
        assert.equal(snapshot.bot.commands, 3);
        assert.equal(snapshot.bot.identities, 2);
        assert.equal(snapshot.bot.players, 2);
        assert.equal(snapshot.bot.sessions.total, 3);
        assert.equal(snapshot.bot.sessions.open, 1);
        assert.equal(snapshot.bot.sessions.connecting, 1);
        assert.equal(snapshot.bot.sessions.closed, 1);
        assert.ok(snapshot.bot.uptimeSeconds >= 89);

        assert.ok(snapshot.memory.totalBytes > 0);
        assert.ok(snapshot.memory.freeBytes >= 0);
        assert.equal(snapshot.memory.usedBytes, snapshot.memory.totalBytes - snapshot.memory.freeBytes);
        assert.ok(snapshot.memory.processRssBytes > 0);

        assert.equal(snapshot.disk.supported, true);
        assert.ok(snapshot.disk.totalBytes > 0);
        assert.equal(snapshot.disk.usedBytes, snapshot.disk.totalBytes - snapshot.disk.freeBytes);
        assert.ok(snapshot.disk.usagePercent >= 0 && snapshot.disk.usagePercent <= 100);

        assert.equal(snapshot.storage.databaseBytes, 2048);
        assert.equal(snapshot.storage.authBytes, 1024);
        assert.equal(snapshot.storage.totalBytes, 3072);
        assert.equal(snapshot.cpu.cores > 0, true);
    });

    it('conta messaggi, comandi e XP della sessione corrente', async () => {
        service.recordMessage();
        service.recordMessage();
        service.recordCommand();
        service.recordChatXp(15);
        service.recordChatXp(20);
        service.setWhatsAppState('open');

        const snapshot = await service.getSnapshot();
        assert.equal(snapshot.bot.messagesReceived, 2);
        assert.equal(snapshot.bot.commandsExecuted, 1);
        assert.equal(snapshot.bot.chatXpAwards, 2);
        assert.equal(snapshot.bot.chatXpTotal, 35);
        assert.equal(snapshot.bot.whatsapp.state, 'open');
        assert.ok(snapshot.bot.whatsapp.updatedAt);
    });

    it('espone lo stato della dashboard web', () => {
        assert.equal(service.getWebInfo().enabled, false);
        service.setWebInfo({ enabled: true, authRequired: true, url: 'http://127.0.0.1:3000' });
        assert.deepEqual(service.getWebInfo(), {
            enabled: true,
            authRequired: true,
            url: 'http://127.0.0.1:3000',
            reason: 'not_started',
        });
    });
});

describe('/dashboard', () => {
    it('mostra statistiche, RAM, disco e stato della dashboard web', async () => {
        const output = await runDashboardCommand(makeDashboardView(makeSnapshot()));
        assert.match(output, /DASHBOARD OWNER/);
        assert.match(output, /Uptime: 1g 1h/);
        assert.match(output, /WhatsApp: 🟢 Connesso/);
        assert.match(output, /Sessioni gestite: 1 aperte \/ 2/);
        assert.match(output, /RAM/);
        assert.match(output, /Libera: 5,0 GB/);
        assert.match(output, /DISCO/);
        assert.match(output, /Occupato: 120,0 GB \/ 256,0 GB \(47%\)/);
        assert.match(output, /Database: 1,0 MB/);
        assert.match(output, /Dashboard web: ✅ attiva/);
        assert.match(output, /http:\/\/127\.0\.0\.1:3000/);
        assert.match(output, /protetto da token/);
    });

    it('non espone mai il token nel messaggio', async () => {
        const output = await runDashboardCommand(makeDashboardView(makeSnapshot()));
        assert.doesNotMatch(output, /secret-token|DASHBOARD_TOKEN=/);
    });

    it('spiega quando la dashboard web è disattivata per token mancante', async () => {
        const snapshot = makeSnapshot({
            web: { enabled: false, authRequired: false, url: null, reason: 'token_required' },
        });
        const output = await runDashboardCommand(makeDashboardView(snapshot));
        assert.match(output, /Dashboard web: ⚠️ disattivata/);
        assert.match(output, /DASHBOARD_TOKEN/);
    });

    it('gestisce un disco non disponibile senza interrompere il comando', async () => {
        const snapshot = makeSnapshot({
            disk: {
                supported: false,
                path: '/project',
                totalBytes: 0,
                usedBytes: 0,
                freeBytes: 0,
                availableBytes: 0,
                usagePercent: 0,
                error: 'non disponibile',
            },
        });
        const output = await runDashboardCommand(makeDashboardView(snapshot));
        assert.match(output, /Statistiche del disco non disponibili/);
        assert.match(output, /Database: 1,0 MB/);
    });

    it('è owner-only e vive nella categoria owner', () => {
        assert.equal(dashboardCommand.ownerOnly, true);
        assert.equal(dashboardCommand.category, 'owner');
        assert.equal(dashboardCommand.name, 'dashboard');
    });
});

describe('Dashboard web', () => {
    let running;

    afterEach(async () => {
        if (running) {
            await running.stop();
            running = null;
        }
    });

    function logger() {
        return { log() { }, warn() { }, error() { } };
    }

    it('serve la pagina e protegge le API con il token', async () => {
        const service = {
            webInfo: {},
            getSnapshot: async () => makeSnapshot(),
            setWebInfo(info) {
                this.webInfo = { ...this.webInfo, ...info };
            },
            getWebInfo() {
                return { ...this.webInfo };
            },
        };
        running = await startDashboardServer({
            service,
            token: 'super-secret-token',
            host: '127.0.0.1',
            port: 0,
            logger: logger(),
        });
        assert.ok(running);
        assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+$/);

        const page = await fetch(`${running.url}/`);
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-type') ?? '', /text\/html/);
        assert.match(await page.text(), /Dashboard Owner/);

        const unauthorized = await fetch(`${running.url}/api/stats`);
        assert.equal(unauthorized.status, 401);
        assert.deepEqual(await unauthorized.json(), { error: 'unauthorized' });

        const authorized = await fetch(`${running.url}/api/stats`, {
            headers: { Authorization: 'Bearer super-secret-token' },
        });
        assert.equal(authorized.status, 200);
        const data = await authorized.json();
        assert.equal(data.bot.name, 'GG Bot');
        assert.equal(data.disk.supported, true);
        assert.equal(service.getWebInfo().enabled, true);
        assert.equal(service.getWebInfo().authRequired, true);
    });

    it('accetta il loopback senza token', async () => {
        const service = {
            getSnapshot: async () => makeSnapshot(),
            setWebInfo(info) {
                this.webInfo = { ...info };
            },
            getWebInfo() {
                return { ...this.webInfo };
            },
        };
        running = await startDashboardServer({
            service,
            token: '',
            host: '127.0.0.1',
            port: 0,
            logger: logger(),
        });
        assert.ok(running);
        const response = await fetch(`${running.url}/api/stats`);
        assert.equal(response.status, 200);
        assert.equal(service.getWebInfo().authRequired, false);
    });

    it('rifiuta di esporsi in LAN senza token', async () => {
        const service = {
            getSnapshot: async () => makeSnapshot(),
            setWebInfo(info) {
                this.webInfo = { ...info };
            },
            getWebInfo() {
                return { ...this.webInfo };
            },
        };
        const result = await startDashboardServer({
            service,
            token: '',
            host: '0.0.0.0',
            port: 0,
            logger: logger(),
        });
        assert.equal(result, null);
        assert.equal(service.getWebInfo().reason, 'token_required');
    });

    it('risponde 404 alle rotte sconosciute', async () => {
        running = await startDashboardServer({
            service: { getSnapshot: async () => makeSnapshot() },
            token: 'super-secret-token',
            host: '127.0.0.1',
            port: 0,
            logger: logger(),
        });
        const response = await fetch(`${running.url}/non-esiste`);
        assert.equal(response.status, 404);
    });
});
