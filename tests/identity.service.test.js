import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IdentityService } from '../lib/identity/identity.service.js';
import { createTestDb, createTempDbPath, cleanupTempDir } from './helpers.js';
import { openDatabase } from '../lib/db/index.js';
describe('IdentityService', () => {
    let db;
    beforeEach(() => {
        db = createTestDb();
    });
    it('fromJid creates an identity with pn', () => {
        const svc = new IdentityService({}, db);
        const id = svc.fromJid('1234567890@s.whatsapp.net');
        assert.ok(id);
        assert.ok(id.userId);
        assert.equal(id.pn, '1234567890@s.whatsapp.net');
        assert.equal(id.lid, null);
    });
    it('fromJid creates an identity with lid', () => {
        const svc = new IdentityService({}, db);
        const id = svc.fromJid(null, 'abcdef@lid');
        assert.ok(id);
        assert.equal(id.lid, 'abcdef@lid');
        assert.equal(id.pn, null);
    });
    it('fromJid returns null when both jids are invalid', () => {
        const svc = new IdentityService({}, db);
        const id = svc.fromJid('invalid-jid-no-at');
        assert.equal(id, null);
    });
    it('userId is stable across new IdentityService instances on same DB', () => {
        const id1 = new IdentityService({}, db).fromJid('111222333@s.whatsapp.net');
        assert.ok(id1);
        const svc2 = new IdentityService({}, db);
        const id2 = svc2.fromJid('111222333@s.whatsapp.net');
        assert.ok(id2);
        assert.equal(id1.userId, id2.userId);
    });
    it('username is persisted and recovered after reload', () => {
        const svc1 = new IdentityService({}, db);
        const id = svc1.fromJid('555666777@s.whatsapp.net');
        assert.ok(id);
        svc1.setUsername(id.userId, 'TestUser');
        const svc2 = new IdentityService({}, db);
        const loaded = svc2.getById(id.userId);
        assert.ok(loaded);
        assert.equal(loaded.username, 'TestUser');
    });
    it('recordLidPnMapping persists and is available after reload', () => {
        const svc1 = new IdentityService({}, db);
        svc1.recordLidPnMapping({
            pn: '999888777@s.whatsapp.net',
            lid: 'aaa111bbb@lid',
        });
        const svc2 = new IdentityService({}, db);
        const id = svc2.resolveByJid('aaa111bbb@lid');
        assert.ok(id);
        assert.equal(id.lid, 'aaa111bbb@lid');
        assert.equal(id.pn, '999888777@s.whatsapp.net');
    });
    it('recordLidPnMappings handles multiple mappings', () => {
        const svc1 = new IdentityService({}, db);
        svc1.recordLidPnMappings([
            { pn: '111222333@s.whatsapp.net', lid: 'aaa@lid' },
            { pn: '444555666@s.whatsapp.net', lid: 'bbb@lid' },
        ]);
        const svc2 = new IdentityService({}, db);
        const id1 = svc2.resolveByJid('aaa@lid');
        const id2 = svc2.resolveByJid('bbb@lid');
        assert.ok(id1);
        assert.ok(id2);
        assert.equal(id1.pn, '111222333@s.whatsapp.net');
        assert.equal(id2.pn, '444555666@s.whatsapp.net');
    });
    it('resolveByJid finds identity by pn', () => {
        const svc = new IdentityService({}, db);
        const created = svc.fromJid('1234567890@s.whatsapp.net');
        assert.ok(created);
        const resolved = svc.resolveByJid('1234567890@s.whatsapp.net');
        assert.ok(resolved);
        assert.equal(resolved.userId, created.userId);
    });
    it('resolveByJid finds identity by lid', () => {
        const svc = new IdentityService({}, db);
        const created = svc.fromJid(null, 'abcdef@lid');
        assert.ok(created);
        const resolved = svc.resolveByJid('abcdef@lid');
        assert.ok(resolved);
        assert.equal(resolved.userId, created.userId);
    });
    it('setUsername returns false for nonexistent user', () => {
        const svc = new IdentityService({}, db);
        const result = svc.setUsername('nonexistent', 'name');
        assert.equal(result, false);
    });
    it('getAllIdentities returns all created identities', () => {
        const svc = new IdentityService({}, db);
        svc.fromJid('111@s.whatsapp.net');
        svc.fromJid('222@s.whatsapp.net');
        svc.fromJid(null, 'lid1@lid');
        const all = svc.getAllIdentities();
        assert.equal(all.length, 3);
    });
    it('true restart: identities survive file-based DB close/reopen', async () => {
        const tempPath = createTempDbPath();
        try {
            {
                const db1 = openDatabase(tempPath);
                const svc1 = new IdentityService({}, db1);
                const id = svc1.fromJid('5551234567@s.whatsapp.net');
                assert.ok(id);
                svc1.setUsername(id.userId, 'PersistentUser');
                svc1.recordLidPnMapping({
                    pn: '5551234567@s.whatsapp.net',
                    lid: 'lid555@lid',
                });
                db1.close();
            }
            {
                const db2 = openDatabase(tempPath);
                const svc2 = new IdentityService({}, db2);
                const resolved = svc2.resolveByJid('5551234567@s.whatsapp.net');
                assert.ok(resolved);
                assert.equal(resolved.username, 'PersistentUser');
                const lidResolved = svc2.resolveByJid('lid555@lid');
                assert.ok(lidResolved);
                assert.equal(lidResolved.pn, '5551234567@s.whatsapp.net');
                db2.close();
            }
        }
        finally {
            cleanupTempDir(tempPath);
        }
    });
});
