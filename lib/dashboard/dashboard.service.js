import os from 'node:os';
import path from 'node:path';
import { readdir, stat, statfs } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STORAGE_CACHE_MS = 60_000;
const COUNTED_TABLES = ['identities', 'players', 'ai_chats', 'ai_messages'];

function countRows(db, table) {
    if (!db) {
        return 0;
    }
    try {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
        return Number(row?.count ?? 0);
    }
    catch {
        return 0;
    }
}

function bytesFromStatfs(info) {
    const blockSize = Number(info?.bsize ?? 0);
    const totalBlocks = Number(info?.blocks ?? 0);
    const freeBlocks = Number(info?.bfree ?? 0);
    const availableBlocks = Number(info?.bavail ?? freeBlocks);
    if (!Number.isFinite(blockSize) || blockSize <= 0 || !Number.isFinite(totalBlocks) || totalBlocks <= 0) {
        return null;
    }
    const totalBytes = totalBlocks * blockSize;
    const freeBytes = Math.max(0, Math.min(totalBlocks, freeBlocks)) * blockSize;
    const availableBytes = Math.max(0, Math.min(totalBlocks, availableBlocks)) * blockSize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
        totalBytes,
        usedBytes,
        freeBytes,
        availableBytes,
        usagePercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
    };
}

async function directorySize(directory) {
    let total = 0;
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    }
    catch {
        return 0;
    }
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        try {
            if (entry.isDirectory()) {
                total += await directorySize(fullPath);
            }
            else if (entry.isFile()) {
                total += (await stat(fullPath)).size;
            }
        }
        catch {
            // Un file può sparire mentre la dashboard lo conta: ignoralo.
        }
    }
    return total;
}

function sessionCounts(sessionManager) {
    const sessions = sessionManager?.listSessions?.() ?? [];
    const counts = { total: sessions.length, open: 0, connecting: 0, closed: 0 };
    for (const session of sessions) {
        if (session.state === 'open') {
            counts.open += 1;
        }
        else if (session.state === 'connecting') {
            counts.connecting += 1;
        }
        else {
            counts.closed += 1;
        }
    }
    return counts;
}

/**
 * Raccoglie le statistiche mostrate dalla dashboard in chat e dalla pagina web.
 * I conteggi dei messaggi/comandi sono per la sessione corrente del processo.
 */
export class DashboardService {
    db;
    rpg;
    identityService;
    sessionManager;
    registry;
    projectRoot;
    dbPath;
    authRoot;
    startedAt;
    now;
    webInfo;
    messagesReceived = 0;
    commandsExecuted = 0;
    chatXpAwards = 0;
    chatXpTotal = 0;
    whatsapp = { state: 'unknown', updatedAt: null };
    storageCache = { at: 0, value: null };

    constructor(options = {}) {
        this.db = options.db ?? null;
        this.rpg = options.rpg ?? null;
        this.identityService = options.identityService ?? null;
        this.sessionManager = options.sessionManager ?? null;
        this.registry = options.registry ?? null;
        this.projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT);
        this.dbPath = path.resolve(options.dbPath ?? path.join(this.projectRoot, 'data', 'gg-bot.db'));
        this.authRoot = path.resolve(options.authRoot ?? path.join(this.projectRoot, 'auth'));
        this.startedAt = options.startedAt ?? Date.now();
        this.now = options.now ?? (() => Date.now());
        this.webInfo = {
            enabled: false,
            authRequired: false,
            url: null,
            reason: 'not_started',
        };
    }

    setSessionManager(sessionManager) {
        this.sessionManager = sessionManager;
    }

    setWebInfo(info) {
        this.webInfo = {
            ...this.webInfo,
            ...(info ?? {}),
        };
    }

    getWebInfo() {
        return { ...this.webInfo };
    }

    recordMessage() {
        this.messagesReceived += 1;
    }

    recordCommand() {
        this.commandsExecuted += 1;
    }

    recordChatXp(amount) {
        this.chatXpAwards += 1;
        this.chatXpTotal += Math.max(0, Number(amount) || 0);
    }

    setWhatsAppState(state) {
        this.whatsapp = {
            state,
            updatedAt: new Date(this.now()).toISOString(),
        };
    }

    async getSnapshot() {
        const [disk, storage] = await Promise.all([this.readDisk(), this.readStorage()]);
        const memory = this.readMemory();
        const cpu = this.readCpu();
        const sessions = sessionCounts(this.sessionManager);
        const counts = {
            identities: countRows(this.db, COUNTED_TABLES[0]),
            players: countRows(this.db, COUNTED_TABLES[1]),
            aiChats: countRows(this.db, COUNTED_TABLES[2]),
            aiMessages: countRows(this.db, COUNTED_TABLES[3]),
        };
        const uptimeSeconds = Math.max(0, Math.floor((this.now() - this.startedAt) / 1000));
        return {
            generatedAt: new Date(this.now()).toISOString(),
            bot: {
                name: 'GG Bot',
                uptimeSeconds,
                startedAt: new Date(this.startedAt).toISOString(),
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                pid: process.pid,
                commands: this.registry?.getAll?.().length ?? 0,
                ...counts,
                messagesReceived: this.messagesReceived,
                commandsExecuted: this.commandsExecuted,
                chatXpAwards: this.chatXpAwards,
                chatXpTotal: this.chatXpTotal,
                sessions,
                whatsapp: { ...this.whatsapp },
            },
            memory,
            disk,
            storage,
            cpu,
            web: this.getWebInfo(),
        };
    }

    readMemory() {
        const totalBytes = os.totalmem();
        const freeBytes = os.freemem();
        const usedBytes = Math.max(0, totalBytes - freeBytes);
        const usage = process.memoryUsage();
        return {
            totalBytes,
            freeBytes,
            usedBytes,
            usagePercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
            processRssBytes: usage.rss,
            processHeapTotalBytes: usage.heapTotal,
            processHeapUsedBytes: usage.heapUsed,
            processExternalBytes: usage.external,
        };
    }

    readCpu() {
        const cpus = os.cpus() ?? [];
        const loadAverage = os.loadavg().slice(0, 3);
        const coreCount = cpus.length;
        return {
            model: cpus[0]?.model?.trim() ?? 'Sconosciuta',
            cores: coreCount,
            loadAverage,
            usagePercent: coreCount > 0 ? (loadAverage[0] / coreCount) * 100 : 0,
        };
    }

    async readDisk() {
        try {
            const info = await statfs(this.projectRoot);
            const parsed = bytesFromStatfs(info);
            if (!parsed) {
                throw new Error('statfs returned no usable values');
            }
            return {
                supported: true,
                path: this.projectRoot,
                ...parsed,
            };
        }
        catch (error) {
            return {
                supported: false,
                path: this.projectRoot,
                totalBytes: 0,
                usedBytes: 0,
                freeBytes: 0,
                availableBytes: 0,
                usagePercent: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async readStorage() {
        const current = this.now();
        if (this.storageCache.value && current - this.storageCache.at < STORAGE_CACHE_MS) {
            return { ...this.storageCache.value };
        }
        const [dbInfo, authBytes] = await Promise.all([
            stat(this.dbPath).catch(() => null),
            directorySize(this.authRoot),
        ]);
        const value = {
            databaseBytes: dbInfo?.isFile() ? dbInfo.size : 0,
            authBytes,
            totalBytes: (dbInfo?.isFile() ? dbInfo.size : 0) + authBytes,
        };
        this.storageCache = { at: current, value };
        return { ...value };
    }
}

/** Vista inerte usata dai test o quando la dashboard non è collegata al dispatcher. */
export function disabledDashboardView() {
    return {
        async getSnapshot() {
            return null;
        },
        getWebInfo() {
            return { enabled: false, authRequired: false, url: null, reason: 'unavailable' };
        },
        recordMessage() { },
        recordCommand() { },
        recordChatXp() { },
        setWhatsAppState() { },
    };
}
