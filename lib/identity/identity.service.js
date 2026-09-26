import { randomUUID } from 'node:crypto';
import { isJidGroup, jidDecode, jidEncode, } from '@whiskeysockets/baileys';
const PN_SERVERS = new Set(['s.whatsapp.net', 'hosted']);
const LID_SERVERS = new Set(['lid', 'hosted.lid']);
function classifyJid(jid) {
    if (!jid)
        return null;
    const decoded = jidDecode(jid);
    if (!decoded)
        return null;
    const side = PN_SERVERS.has(decoded.server)
        ? 'pn'
        : LID_SERVERS.has(decoded.server)
            ? 'lid'
            : null;
    if (!side)
        return null;
    return { side, user: decoded.user, jid: jidEncode(decoded.user, decoded.server) };
}
function indexKey(side, user) {
    return `${side}:${user}`;
}
export class IdentityService {
    identities = new Map();
    indexByJid = new Map();
    pnToLidUsers = new Map();
    lidToPnUsers = new Map();
    generateUserId;
    lidPnResolver;
    db;
    stmts;
    constructor(options = {}, db) {
        this.generateUserId = options.generateUserId ?? (() => randomUUID());
        this.lidPnResolver = options.lidPnResolver;
        this.db = db ?? null;
        if (this.db) {
            this.stmts = {
                selectAllIdentities: this.db.prepare(`SELECT user_id, lid_jid, pn_jid, username FROM identities`),
                upsertIdentity: this.db.prepare(`INSERT INTO identities (user_id, lid_jid, pn_jid, username)
           VALUES (@userId, @lidJid, @pnJid, @username)
           ON CONFLICT(user_id) DO UPDATE SET
             lid_jid = @lidJid, pn_jid = @pnJid, username = @username`),
                selectAllMappings: this.db.prepare(`SELECT lid_user, pn_user FROM lid_pn_mappings`),
                insertMapping: this.db.prepare(`INSERT OR IGNORE INTO lid_pn_mappings (lid_user, pn_user) VALUES (?, ?)`),
            };
            this.loadIdentities();
            this.loadMappings();
        }
        else {
            this.stmts = null;
        }
    }
    setLidPnResolver(resolver) {
        this.lidPnResolver = resolver;
    }
    fromMessage(message) {
        const key = message.key;
        const chatJid = key.remoteJid;
        if (!chatJid)
            return null;
        const isGroup = isJidGroup(chatJid) === true;
        const senderJid = (isGroup ? key.participant : undefined) ?? chatJid;
        const altJid = (isGroup ? key.participantAlt : key.remoteJidAlt) ?? null;
        const username = key.participantUsername ?? key.remoteJidUsername ?? null;
        return this.fromJid(senderJid, altJid, username);
    }
    fromJid(jid, altJid, username) {
        const primary = classifyJid(jid);
        const alt = classifyJid(altJid);
        let lid = primary?.side === 'lid' ? primary : (alt?.side === 'lid' ? alt : undefined);
        let pn = primary?.side === 'pn' ? primary : (alt?.side === 'pn' ? alt : undefined);
        if (!lid && !pn)
            return null;
        const existing = this.findExisting(lid, pn);
        if (!existing && pn && !lid) {
            const mappedLidUser = this.pnToLidUsers.get(pn.user);
            if (mappedLidUser)
                lid = { side: 'lid', user: mappedLidUser, jid: jidEncode(mappedLidUser, 'lid') };
        }
        if (!existing && lid && !pn) {
            const mappedPnUser = this.lidToPnUsers.get(lid.user);
            if (mappedPnUser)
                pn = { side: 'pn', user: mappedPnUser, jid: jidEncode(mappedPnUser, 's.whatsapp.net') };
        }
        return this.upsert(existing?.userId, lid, pn, username ?? null);
    }
    recordLidPnMapping(mapping) {
        this.recordLidPnMappings([mapping]);
    }
    recordLidPnMappings(mappings) {
        for (const { pn, lid } of mappings) {
            const classifiedPn = classifyJid(pn);
            const classifiedLid = classifyJid(lid);
            if (!classifiedPn || !classifiedLid)
                continue;
            this.pnToLidUsers.set(classifiedPn.user, classifiedLid.user);
            this.lidToPnUsers.set(classifiedLid.user, classifiedPn.user);
            this.persistMapping(classifiedLid.user, classifiedPn.user);
            const existing = this.findExisting(classifiedLid, classifiedPn);
            if (existing) {
                this.upsert(existing.userId, classifiedLid, classifiedPn, existing.username);
            }
        }
    }
    async getSendableJid(identity) {
        const current = this.getById(identity.userId);
        const lidJid = current?.lid ?? identity.lid;
        if (lidJid)
            return lidJid;
        const pnJid = current?.pn ?? identity.pn;
        if (!pnJid)
            return null;
        if (this.lidPnResolver) {
            const resolvedLid = await this.lidPnResolver.getLIDForPN(pnJid);
            if (resolvedLid) {
                this.recordLidPnMapping({ pn: pnJid, lid: resolvedLid });
                return this.getById(identity.userId)?.lid ?? pnJid;
            }
        }
        return pnJid;
    }
    setUsername(userId, username) {
        const identity = this.identities.get(userId);
        if (!identity)
            return false;
        identity.username = username;
        this.persistIdentity(identity);
        return true;
    }
    getById(userId) {
        const identity = this.identities.get(userId);
        return identity ? { ...identity } : null;
    }
    resolveByJid(jid) {
        const classified = classifyJid(jid);
        if (!classified)
            return null;
        const direct = this.indexByJid.get(indexKey(classified.side, classified.user));
        const linked = this.linkedIndexKey(classified);
        const userId = direct ?? (linked ? this.indexByJid.get(linked) : undefined);
        return userId ? this.getById(userId) : null;
    }
    getAllIdentities() {
        return [...this.identities.values()].map((identity) => ({ ...identity }));
    }
    linkedIndexKey(classified) {
        const mappedUser = classified.side === 'pn'
            ? this.pnToLidUsers.get(classified.user)
            : this.lidToPnUsers.get(classified.user);
        if (!mappedUser)
            return undefined;
        const otherSide = classified.side === 'pn' ? 'lid' : 'pn';
        return indexKey(otherSide, mappedUser);
    }
    findExisting(lid, pn) {
        if (lid) {
            const userId = this.indexByJid.get(indexKey('lid', lid.user));
            if (userId)
                return this.identities.get(userId) ?? null;
        }
        if (pn) {
            const userId = this.indexByJid.get(indexKey('pn', pn.user));
            if (userId)
                return this.identities.get(userId) ?? null;
        }
        return null;
    }
    upsert(userId, lid, pn, username) {
        const id = userId ?? this.generateUserId();
        const existing = this.identities.get(id);
        const identity = {
            userId: id,
            lid: lid?.jid ?? existing?.lid ?? null,
            pn: pn?.jid ?? existing?.pn ?? null,
            username: username ?? existing?.username ?? null,
        };
        this.identities.set(id, identity);
        const classifiedLid = identity.lid ? classifyJid(identity.lid) : undefined;
        if (classifiedLid)
            this.indexByJid.set(indexKey('lid', classifiedLid.user), id);
        const classifiedPn = identity.pn ? classifyJid(identity.pn) : undefined;
        if (classifiedPn)
            this.indexByJid.set(indexKey('pn', classifiedPn.user), id);
        this.persistIdentity(identity);
        return { ...identity };
    }
    loadIdentities() {
        if (!this.stmts)
            return;
        const rows = this.stmts.selectAllIdentities.all();
        for (const row of rows) {
            const identity = {
                userId: row.user_id,
                lid: row.lid_jid,
                pn: row.pn_jid,
                username: row.username,
            };
            this.identities.set(identity.userId, identity);
            const classifiedLid = identity.lid ? classifyJid(identity.lid) : undefined;
            if (classifiedLid)
                this.indexByJid.set(indexKey('lid', classifiedLid.user), identity.userId);
            const classifiedPn = identity.pn ? classifyJid(identity.pn) : undefined;
            if (classifiedPn)
                this.indexByJid.set(indexKey('pn', classifiedPn.user), identity.userId);
        }
    }
    loadMappings() {
        if (!this.stmts)
            return;
        const rows = this.stmts.selectAllMappings.all();
        for (const row of rows) {
            this.pnToLidUsers.set(row.pn_user, row.lid_user);
            this.lidToPnUsers.set(row.lid_user, row.pn_user);
            const classifiedLid = { side: 'lid', user: row.lid_user, jid: jidEncode(row.lid_user, 'lid') };
            const classifiedPn = { side: 'pn', user: row.pn_user, jid: jidEncode(row.pn_user, 's.whatsapp.net') };
            const existing = this.findExisting(classifiedLid, classifiedPn);
            if (!existing) {
                this.upsert(undefined, classifiedLid, classifiedPn, null);
            }
        }
    }
    persistIdentity(identity) {
        if (!this.stmts)
            return;
        this.stmts.upsertIdentity.run({
            userId: identity.userId,
            lidJid: identity.lid,
            pnJid: identity.pn,
            username: identity.username,
        });
    }
    persistMapping(lidUser, pnUser) {
        if (!this.stmts)
            return;
        this.stmts.insertMapping.run(lidUser, pnUser);
    }
}
