import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  isJidGroup,
  jidDecode,
  jidEncode,
  type LIDMapping,
  type WAMessage,
} from '@whiskeysockets/baileys';
import type {
  IdentityServiceOptions,
  LidPnResolver,
  WaUserIdentity,
} from './types.js';

type JidSide = 'lid' | 'pn';

interface ClassifiedJid {
  side: JidSide;
  user: string;
  jid: string;
}

const PN_SERVERS: ReadonlySet<string> = new Set(['s.whatsapp.net', 'hosted']);
const LID_SERVERS: ReadonlySet<string> = new Set(['lid', 'hosted.lid']);

function classifyJid(jid: string | null | undefined): ClassifiedJid | null {
  if (!jid) return null;
  const decoded = jidDecode(jid);
  if (!decoded) return null;
  const side: JidSide | null = PN_SERVERS.has(decoded.server)
    ? 'pn'
    : LID_SERVERS.has(decoded.server)
      ? 'lid'
      : null;
  if (!side) return null;
  return { side, user: decoded.user, jid: jidEncode(decoded.user, decoded.server) };
}

function indexKey(side: JidSide, user: string): string {
  return `${side}:${user}`;
}

export class IdentityService {
  private readonly identities = new Map<string, WaUserIdentity>();
  private readonly indexByJid = new Map<string, string>();
  private readonly pnToLidUsers = new Map<string, string>();
  private readonly lidToPnUsers = new Map<string, string>();
  private readonly generateUserId: () => string;
  private lidPnResolver?: LidPnResolver;
  private readonly db: Database.Database | null;
  private readonly stmts: {
    selectAllIdentities: Database.Statement;
    upsertIdentity: Database.Statement;
    selectAllMappings: Database.Statement;
    insertMapping: Database.Statement;
  } | null;

  constructor(options: IdentityServiceOptions = {}, db?: Database.Database) {
    this.generateUserId = options.generateUserId ?? (() => randomUUID());
    this.lidPnResolver = options.lidPnResolver;
    this.db = db ?? null;

    if (this.db) {
      this.stmts = {
        selectAllIdentities: this.db.prepare(
          `SELECT user_id, lid_jid, pn_jid, username FROM identities`,
        ),
        upsertIdentity: this.db.prepare(
          `INSERT INTO identities (user_id, lid_jid, pn_jid, username)
           VALUES (@userId, @lidJid, @pnJid, @username)
           ON CONFLICT(user_id) DO UPDATE SET
             lid_jid = @lidJid, pn_jid = @pnJid, username = @username`,
        ),
        selectAllMappings: this.db.prepare(
          `SELECT lid_user, pn_user FROM lid_pn_mappings`,
        ),
        insertMapping: this.db.prepare(
          `INSERT OR IGNORE INTO lid_pn_mappings (lid_user, pn_user) VALUES (?, ?)`,
        ),
      };
      this.loadIdentities();
      this.loadMappings();
    } else {
      this.stmts = null;
    }
  }

  setLidPnResolver(resolver: LidPnResolver): void {
    this.lidPnResolver = resolver;
  }

  fromMessage(message: WAMessage): WaUserIdentity | null {
    const key = message.key;
    const chatJid = key.remoteJid;
    if (!chatJid) return null;
    const isGroup = isJidGroup(chatJid) === true;
    const senderJid = (isGroup ? key.participant : undefined) ?? chatJid;
    const altJid = (isGroup ? key.participantAlt : key.remoteJidAlt) ?? null;
    const username = key.participantUsername ?? key.remoteJidUsername ?? null;
    return this.fromJid(senderJid, altJid, username);
  }

  fromJid(
    jid: string | null | undefined,
    altJid?: string | null,
    username?: string | null,
  ): WaUserIdentity | null {
    const primary = classifyJid(jid);
    const alt = classifyJid(altJid);
    let lid = primary?.side === 'lid' ? primary : (alt?.side === 'lid' ? alt : undefined);
    let pn = primary?.side === 'pn' ? primary : (alt?.side === 'pn' ? alt : undefined);
    if (!lid && !pn) return null;

    const existing = this.findExisting(lid, pn);
    if (!existing && pn && !lid) {
      const mappedLidUser = this.pnToLidUsers.get(pn.user);
      if (mappedLidUser) lid = { side: 'lid', user: mappedLidUser, jid: jidEncode(mappedLidUser, 'lid') };
    }
    if (!existing && lid && !pn) {
      const mappedPnUser = this.lidToPnUsers.get(lid.user);
      if (mappedPnUser) pn = { side: 'pn', user: mappedPnUser, jid: jidEncode(mappedPnUser, 's.whatsapp.net') };
    }
    return this.upsert(existing?.userId, lid, pn, username ?? null);
  }

  recordLidPnMapping(mapping: LIDMapping): void {
    this.recordLidPnMappings([mapping]);
  }

  recordLidPnMappings(mappings: readonly LIDMapping[]): void {
    for (const { pn, lid } of mappings) {
      const classifiedPn = classifyJid(pn);
      const classifiedLid = classifyJid(lid);
      if (!classifiedPn || !classifiedLid) continue;
      this.pnToLidUsers.set(classifiedPn.user, classifiedLid.user);
      this.lidToPnUsers.set(classifiedLid.user, classifiedPn.user);
      this.persistMapping(classifiedLid.user, classifiedPn.user);
      const existing = this.findExisting(classifiedLid, classifiedPn);
      if (existing) {
        this.upsert(existing.userId, classifiedLid, classifiedPn, existing.username);
      }
    }
  }

  async getSendableJid(identity: WaUserIdentity): Promise<string | null> {
    const current = this.getById(identity.userId);
    const lidJid = current?.lid ?? identity.lid;
    if (lidJid) return lidJid;
    const pnJid = current?.pn ?? identity.pn;
    if (!pnJid) return null;
    if (this.lidPnResolver) {
      const resolvedLid = await this.lidPnResolver.getLIDForPN(pnJid);
      if (resolvedLid) {
        this.recordLidPnMapping({ pn: pnJid, lid: resolvedLid });
        return this.getById(identity.userId)?.lid ?? pnJid;
      }
    }
    return pnJid;
  }

  setUsername(userId: string, username: string): boolean {
    const identity = this.identities.get(userId);
    if (!identity) return false;
    identity.username = username;
    this.persistIdentity(identity);
    return true;
  }

  getById(userId: string): WaUserIdentity | null {
    const identity = this.identities.get(userId);
    return identity ? { ...identity } : null;
  }

  resolveByJid(jid: string): WaUserIdentity | null {
    const classified = classifyJid(jid);
    if (!classified) return null;
    const direct = this.indexByJid.get(indexKey(classified.side, classified.user));
    const linked = this.linkedIndexKey(classified);
    const userId = direct ?? (linked ? this.indexByJid.get(linked) : undefined);
    return userId ? this.getById(userId) : null;
  }

  getAllIdentities(): WaUserIdentity[] {
    return [...this.identities.values()].map((identity) => ({ ...identity }));
  }

  private linkedIndexKey(classified: ClassifiedJid): string | undefined {
    const mappedUser =
      classified.side === 'pn'
        ? this.pnToLidUsers.get(classified.user)
        : this.lidToPnUsers.get(classified.user);
    if (!mappedUser) return undefined;
    const otherSide: JidSide = classified.side === 'pn' ? 'lid' : 'pn';
    return indexKey(otherSide, mappedUser);
  }

  private findExisting(
    lid: ClassifiedJid | undefined,
    pn: ClassifiedJid | undefined,
  ): WaUserIdentity | null {
    if (lid) {
      const userId = this.indexByJid.get(indexKey('lid', lid.user));
      if (userId) return this.identities.get(userId) ?? null;
    }
    if (pn) {
      const userId = this.indexByJid.get(indexKey('pn', pn.user));
      if (userId) return this.identities.get(userId) ?? null;
    }
    return null;
  }

  private upsert(
    userId: string | undefined,
    lid: ClassifiedJid | undefined,
    pn: ClassifiedJid | undefined,
    username: string | null,
  ): WaUserIdentity {
    const id = userId ?? this.generateUserId();
    const existing = this.identities.get(id);
    const identity: WaUserIdentity = {
      userId: id,
      lid: lid?.jid ?? existing?.lid ?? null,
      pn: pn?.jid ?? existing?.pn ?? null,
      username: username ?? existing?.username ?? null,
    };
    this.identities.set(id, identity);
    const classifiedLid = identity.lid ? classifyJid(identity.lid) : undefined;
    if (classifiedLid) this.indexByJid.set(indexKey('lid', classifiedLid.user), id);
    const classifiedPn = identity.pn ? classifyJid(identity.pn) : undefined;
    if (classifiedPn) this.indexByJid.set(indexKey('pn', classifiedPn.user), id);
    this.persistIdentity(identity);
    return { ...identity };
  }

  private loadIdentities(): void {
    if (!this.stmts) return;
    const rows = this.stmts.selectAllIdentities.all() as Array<{
      user_id: string;
      lid_jid: string | null;
      pn_jid: string | null;
      username: string | null;
    }>;
    for (const row of rows) {
      const identity: WaUserIdentity = {
        userId: row.user_id,
        lid: row.lid_jid,
        pn: row.pn_jid,
        username: row.username,
      };
      this.identities.set(identity.userId, identity);
      const classifiedLid = identity.lid ? classifyJid(identity.lid) : undefined;
      if (classifiedLid) this.indexByJid.set(indexKey('lid', classifiedLid.user), identity.userId);
      const classifiedPn = identity.pn ? classifyJid(identity.pn) : undefined;
      if (classifiedPn) this.indexByJid.set(indexKey('pn', classifiedPn.user), identity.userId);
    }
  }

  private loadMappings(): void {
    if (!this.stmts) return;
    const rows = this.stmts.selectAllMappings.all() as Array<{
      lid_user: string;
      pn_user: string;
    }>;
    for (const row of rows) {
      this.pnToLidUsers.set(row.pn_user, row.lid_user);
      this.lidToPnUsers.set(row.lid_user, row.pn_user);

      const classifiedLid: ClassifiedJid = { side: 'lid', user: row.lid_user, jid: jidEncode(row.lid_user, 'lid') };
      const classifiedPn: ClassifiedJid = { side: 'pn', user: row.pn_user, jid: jidEncode(row.pn_user, 's.whatsapp.net') };
      const existing = this.findExisting(classifiedLid, classifiedPn);
      if (!existing) {
        this.upsert(undefined, classifiedLid, classifiedPn, null);
      }
    }
  }

  private persistIdentity(identity: WaUserIdentity): void {
    if (!this.stmts) return;
    this.stmts.upsertIdentity.run({
      userId: identity.userId,
      lidJid: identity.lid,
      pnJid: identity.pn,
      username: identity.username,
    });
  }

  private persistMapping(lidUser: string, pnUser: string): void {
    if (!this.stmts) return;
    this.stmts.insertMapping.run(lidUser, pnUser);
  }
}
