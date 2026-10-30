import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RpgService } from '../lib/rpg/rpg.service.js';
import { PlayerRepository } from '../lib/rpg/player.repository.js';
import { IdentityService } from '../lib/identity/identity.service.js';
import { CommandRegistry } from '../lib/commands/registry.js';
import { COMMAND_ALIASES } from '../lib/commands/aliases.js';
import { registerMessageLogger } from '../handler.js';
import { createTestDb, insertTestIdentity } from './helpers.js';
import xpCommand from '../plugins/rpg/xp.js';

const JID = '123456789@s.whatsapp.net';
const uid = 'xp-user-1';
const uid2 = 'xp-user-2';

describe('XP globale', () => {
    let db;
    let repo;
    let rpg;
    let identityService;

    beforeEach(() => {
        db = createTestDb();
        insertTestIdentity(db, uid);
        insertTestIdentity(db, uid2);
        repo = new PlayerRepository(db);
        rpg = new RpgService(repo);
        identityService = new IdentityService({}, db);
    });

    async function runCommand(command, context = {}) {
        const replies = [];
        await command.execute({
            args: [],
            identity: { userId: uid },
            rpg,
            reply: async (text) => replies.push(text),
            ...context,
        });
        return replies.join('\n');
    }

    function makeSocket() {
        const socket = {
            ev: new EventEmitter(),
            user: { id: '999999@s.whatsapp.net' },
            sent: [],
            async sendMessage(jid, content) {
                socket.sent.push({ jid, content });
                return {};
            },
        };
        return socket;
    }

    function emitMessage(socket, text) {
        socket.ev.emit('messages.upsert', {
            messages: [
                {
                    key: { remoteJid: JID, id: `m-${Math.random()}`, fromMe: false },
                    message: { conversation: text },
                },
            ],
            type: 'notify',
        });
    }

    it('shows level, progress and global position with /xp', async () => {
        const player = rpg.getOrCreatePlayer(uid);
        player.level = 3;
        player.xp = 45;
        repo.savePlayer(player);
        const other = rpg.getOrCreatePlayer(uid2);
        other.level = 5;
        repo.savePlayer(other);

        const output = await runCommand(xpCommand);
        assert.match(output, /🏅 XP GLOBAL/);
        assert.match(output, /⭐ Livello: 3/);
        assert.match(output, /✨ XP: 45 \/ 300/);
        assert.match(output, /🌟 XP totali: 345/);
        assert.match(output, /🏅 Posizione: #2 su 2/);
        assert.match(output, /🎯 Mancano 255 XP per il livello 4/);
        assert.doesNotMatch(output, /una volta ogni/i);
    });

    it('is reachable through its aliases', () => {
        const registry = new CommandRegistry(COMMAND_ALIASES);
        const result = registry.register(xpCommand);
        assert.equal(result.ok, true, result.error);
        assert.equal(registry.get('rank')?.name, 'xp');
        assert.equal(registry.get('livello')?.name, 'xp');
    });

    it('awards chat XP through the message handler and announces the level up', async () => {
        const identity = identityService.fromJid(JID);
        const player = rpg.getOrCreatePlayer(identity.userId);
        player.xp = 95;
        repo.savePlayer(player);

        const socket = makeSocket();
        const dispatches = [];
        const dispatcher = {
            rpg,
            handle: async (text) => {
                dispatches.push(text);
                return false;
            },
        };
        registerMessageLogger(socket, identityService, dispatcher);

        emitMessage(socket, 'messaggio abbastanza lungo');
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(dispatches.length, 1);
        const updated = rpg.getPlayer(identity.userId);
        assert.ok(updated);
        assert.equal(updated.level, 2);
        assert.ok(updated.lastChatXp);
        assert.ok(socket.sent.some((entry) => /LEVEL UP/.test(entry.content.text ?? '')));
    });

    it('does not award XP for commands through the message handler', async () => {
        const identity = identityService.fromJid(JID);
        const player = rpg.getOrCreatePlayer(identity.userId);
        repo.savePlayer(player);

        const socket = makeSocket();
        const dispatcher = {
            rpg,
            handle: async () => true,
        };
        registerMessageLogger(socket, identityService, dispatcher);

        emitMessage(socket, '/ping');
        await new Promise((resolve) => setImmediate(resolve));

        const updated = rpg.getPlayer(identity.userId);
        assert.ok(updated);
        assert.equal(updated.xp, 0);
        assert.equal(updated.lastChatXp, null);
    });
});
