import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readdir, rm, stat } from 'node:fs/promises';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

const GLOBAL_AUTH_FOLDER = fileURLToPath(new URL('../../auth', import.meta.url));
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

const NON_RECOVERABLE_REASONS: ReadonlySet<number> = new Set([
  DisconnectReason.loggedOut,
  DisconnectReason.forbidden,
  DisconnectReason.connectionReplaced,
  DisconnectReason.multideviceMismatch,
]);

export type SessionConnectionState = ConnectionState['connection'];
export type SessionConnectionUpdate = Partial<ConnectionState>;

export interface ManagedSession {
  userId: string;
  sock: WASocket;
  authFolder: string;
  state: SessionConnectionState;
  reconnectAttempts: number;
  onQr?: SessionCallbacks['onQr'];
  onOpen?: SessionCallbacks['onOpen'];
  onConnectionUpdate?: SessionCallbacks['onConnectionUpdate'];
}

/** Per-session callbacks, overriding (or supplementing) the manager-level ones. */
export interface SessionCallbacks {
  onQr?: (userId: string, qr: string) => void;
  onOpen?: (userId: string) => void;
  onConnectionUpdate?: (userId: string, update: SessionConnectionUpdate) => void;
}

export interface SessionManagerOptions {
  /** Root folder that holds per-user auth folders. Defaults to the project ./auth. */
  authRoot?: string;
  logLevel?: string;
  /** Called each time a fresh (login) QR is available for the session. */
  onQr?: (userId: string, qr: string) => void;
  /** Called on every connection.update of the session. */
  onConnectionUpdate?: (userId: string, update: SessionConnectionUpdate) => void;
  /** Called when a session reaches the 'open' state. */
  onOpen?: (userId: string) => void;
  /** Test seam: injects a custom socket factory, bypassing real network/auth setup. */
  socketFactory?: (authFolder: string) => Promise<WASocket>;
  /** Invoked on every freshly built socket (initial create and reconnects). */
  onSocketCreated?: (sock: WASocket, session: ManagedSession) => void;
}

function getDisconnectStatusCode(error: Boom | Error | undefined): number | undefined {
  return error instanceof Boom ? error.output.statusCode : undefined;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly authRoot: string;
  private readonly logLevel: string;
  private readonly onQr?: SessionManagerOptions['onQr'];
  private readonly onConnectionUpdate?: SessionManagerOptions['onConnectionUpdate'];
  private readonly onOpen?: SessionManagerOptions['onOpen'];
  private readonly socketFactory: (authFolder: string) => Promise<WASocket>;
  private readonly onSocketCreated?: (sock: WASocket, session: ManagedSession) => void;

  constructor(options: SessionManagerOptions = {}) {
    this.authRoot = path.resolve(options.authRoot ?? GLOBAL_AUTH_FOLDER);
    this.logLevel = options.logLevel ?? 'warn';
    this.onQr = options.onQr;
    this.onConnectionUpdate = options.onConnectionUpdate;
    this.onOpen = options.onOpen;
    this.socketFactory = options.socketFactory ?? this.buildRealSocket.bind(this);
    this.onSocketCreated = options.onSocketCreated;
  }

  hasSession(userId: string): boolean {
    return this.sessions.has(userId);
  }

  getSession(userId: string): WASocket | undefined {
    return this.sessions.get(userId)?.sock;
  }

  getManagedSession(userId: string): ManagedSession | undefined {
    return this.sessions.get(userId);
  }

  get size(): number {
    return this.sessions.size;
  }

  listSessions(): ManagedSession[] {
    return [...this.sessions.values()];
  }

  authFolderFor(userId: string): string {
    return path.join(this.authRoot, sanitizeUserKey(userId));
  }

  async createSession(userId: string, callbacks?: SessionCallbacks): Promise<ManagedSession> {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    const authFolder = path.join(this.authRoot, sanitizeUserKey(userId));
    const session: ManagedSession = {
      userId,
      sock: undefined as unknown as WASocket,
      authFolder,
      state: 'connecting',
      reconnectAttempts: 0,
      onQr: callbacks?.onQr,
      onOpen: callbacks?.onOpen,
      onConnectionUpdate: callbacks?.onConnectionUpdate,
    };
    this.sessions.set(userId, session);
    session.sock = await this.buildSocket(session);
    return session;
  }

  async closeSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;
    this.sessions.delete(userId);
    session.state = 'close';
    try {
      await session.sock.logout();
    } catch {
      /* ignore logout errors while closing */
    }
    try {
      await session.sock.end(undefined);
    } catch {
      /* ignore end errors while closing */
    }
  }

  /**
   * Permanently removes a session: closes its socket (preventing any reconnect)
   * and deletes ONLY the user's auth folder (never the global ./auth).
   * Returns true if there was an active session or a folder to remove.
   */
  async deleteSession(userId: string): Promise<boolean> {
    const hadActive = this.sessions.has(userId);
    await this.closeSession(userId);

    const folder = this.authFolderFor(userId);
    if (!isUnderAuthRoot(this.authRoot, folder)) return hadActive;

    let hadFiles = false;
    try {
      const info = await stat(folder);
      if (info.isDirectory()) hadFiles = true;
    } catch {
      hadFiles = false;
    }

    if (hadFiles) {
      await rm(folder, { recursive: true, force: true });
    }

    return hadActive || hadFiles;
  }

  /**
   * Reconnects every authenticated WhatsApp session previously saved under the
   * auth root (subfolders = sanitized Telegram user ids). The main ./auth session
   * lives as files in the auth root itself and is never treated as a managed
   * session. One failing session never blocks the others.
   * @returns the number of sessions restored.
   */
  async restoreSessions(): Promise<number> {
    const restored: string[] = [];

    let entries: ReadonlyArray<import('node:fs').Dirent<string>> = [];
    try {
      entries = await readdir(this.authRoot, { withFileTypes: true });
    } catch {
      return 0; // auth root missing/not readable -> nothing to restore
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(this.authRoot, entry.name);
      if (!isUnderAuthRoot(this.authRoot, folder)) continue;
      if (!isValidSessionKey(entry.name)) continue;
      if (this.sessions.has(entry.name)) continue; // already present -> no duplicate

      let hasCreds = false;
      try {
        const info = await stat(path.join(folder, 'creds.json'));
        hasCreds = info.isFile();
      } catch {
        hasCreds = false;
      }
      if (!hasCreds) continue; // not authenticated yet -> skip until linked

      const session: ManagedSession = {
        userId: entry.name,
        sock: undefined as unknown as WASocket,
        authFolder: folder,
        state: 'connecting',
        reconnectAttempts: 0,
      };
      this.sessions.set(entry.name, session);
      try {
        session.sock = await this.buildSocket(session);
        restored.push(entry.name);
      } catch (error) {
        console.error(`[sessions] failed to restore session "${entry.name}":`, error);
        this.sessions.delete(entry.name); // allow a later retry; do not block others
      }
    }

    if (restored.length > 0) {
      console.log(`[sessions] restored ${restored.length} saved session(s): ${restored.join(', ')}`);
    }
    return restored.length;
  }

  async closeAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map((id) => this.closeSession(id)));
  }

  private async buildSocket(session: ManagedSession): Promise<WASocket> {
    const sock = await this.socketFactory(session.authFolder);

    sock.ev.on('connection.update', (update) => {
      this.handleConnectionUpdate(session, update);
    });

    this.onSocketCreated?.(sock, session);

    return sock;
  }

  private async buildRealSocket(authFolder: string): Promise<WASocket> {
    const logger = pino({ level: this.logLevel });
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.appropriate('GG Bot'),
      logger,
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
  }

  private handleConnectionUpdate(
    session: ManagedSession,
    update: SessionConnectionUpdate,
  ): void {
    if (update.connection === 'open') {
      session.state = 'open';
      session.reconnectAttempts = 0;
      (session.onOpen ?? this.onOpen)?.(session.userId);
    } else if (update.connection === 'connecting') {
      session.state = 'connecting';
    } else if (update.connection === 'close') {
      session.state = 'close';
      this.scheduleReconnect(session, getDisconnectStatusCode(update.lastDisconnect?.error));
    }
    if (update.qr) {
      (session.onQr ?? this.onQr)?.(session.userId, update.qr);
    }
    (session.onConnectionUpdate ?? this.onConnectionUpdate)?.(session.userId, update);
  }

  private scheduleReconnect(session: ManagedSession, statusCode: number | undefined): void {
    const stillActive = this.sessions.get(session.userId) === session;
    if (!stillActive) return;

    if (statusCode !== undefined && NON_RECOVERABLE_REASONS.has(statusCode)) {
      console.error(
        `[session:${session.userId}] disconnected permanently (code ${statusCode}). Not reconnecting.`,
      );
      if (statusCode === DisconnectReason.loggedOut) {
        console.error(`[session:${session.userId}] logged out. Remove its auth folder to relink.`);
      }
      return;
    }

    if (session.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[session:${session.userId}] gave up reconnecting after ${MAX_RECONNECT_ATTEMPTS} attempts.`,
      );
      return;
    }

    session.reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (session.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    );
    console.log(
      `[session:${session.userId}] disconnected (code ${statusCode ?? 'unknown'}). ` +
        `Reconnecting in ${delay}ms (attempt ${session.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}).`,
    );
    setTimeout(() => {
      if (this.sessions.get(session.userId) === session) {
        void this.reconnect(session);
      }
    }, delay);
  }

  private async reconnect(session: ManagedSession): Promise<void> {
    const newSocket = await this.buildSocket(session);
    session.sock = newSocket;
  }
}

function sanitizeUserKey(userId: string): string {
  const cleaned = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (cleaned.length === 0) throw new Error('invalid (empty) userId for session');
  return cleaned;
}

/** Guards that a candidate folder is a strict child of the auth root (never the root itself). */
function isUnderAuthRoot(authRoot: string, folder: string): boolean {
  const relative = path.relative(authRoot, folder);
  if (relative.length === 0) return false;
  const segments = relative.split(path.sep);
  return !segments.some((seg) => seg === '..' || seg.length === 0 || seg === '.');
}

/** True only if the value is already a valid, self-stable session key (a sanitized user id). */
function isValidSessionKey(key: string): boolean {
  if (key.length === 0) return false;
  if (key === '.' || key === '..') return false;
  try {
    return sanitizeUserKey(key) === key;
  } catch {
    return false;
  }
}
