import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import nuke from '../plugins/group/nuke.js';

const GROUP_JID = '120363000000000000@g.us';
const BOT_ID = '111@s.whatsapp.net';

function makeSock({
    participants = [],
    metadataError = null,
    updateError = null,
    userId = '111:4@s.whatsapp.net',
    lid = null,
} = {}) {
    const calls = [];
    return {
        user: { id: userId, lid },
        calls,
        async groupMetadata(jid) {
            if (metadataError) {
                throw metadataError;
            }
            return { id: jid, participants };
        },
        async groupParticipantsUpdate(jid, ids, action) {
            if (updateError) {
                throw updateError;
            }
            calls.push({ jid, ids: [...ids], action });
            return ids.map((id) => ({ status: '200', jid: id }));
        },
    };
}

async function execute({ sock = makeSock(), chatJid = GROUP_JID, isGroup = true } = {}) {
    const replies = [];
    await nuke.execute({
        sock,
        chatJid,
        isGroup,
        reply: async (text) => {
            replies.push(text);
        },
    });
    return { replies: replies.join('\n'), sock };
}

describe('/nuke', () => {
    it('è owner-only e vive nella categoria group', () => {
        assert.equal(nuke.name, 'nuke');
        assert.equal(nuke.ownerOnly, true);
        assert.equal(nuke.category, 'group');
    });

    it('rifiuta di girare senza socket WhatsApp', async () => {
        const { replies } = await execute({ sock: null });
        assert.match(replies, /solo da WhatsApp/);
    });

    it('rifiuta di girare fuori da un gruppo', async () => {
        const { replies } = await execute({
            isGroup: false,
            chatJid: '393330000000@s.whatsapp.net',
        });
        assert.match(replies, /dentro un gruppo/);
    });

    it('rifiuta se il bot non è amministratore', async () => {
        const sock = makeSock({ participants: [{ id: BOT_ID, admin: null }] });
        const { replies } = await execute({ sock });
        assert.match(replies, /amministratore/);
        assert.equal(sock.calls.length, 0);
    });

    it('rimuove solo i membri non amministratori', async () => {
        const sock = makeSock({
            participants: [
                { id: BOT_ID, admin: 'admin' },
                { id: '222@s.whatsapp.net', admin: 'superadmin' },
                { id: '333@s.whatsapp.net', admin: null },
                { id: '444@s.whatsapp.net', admin: 'admin' },
                { id: '555@s.whatsapp.net' },
            ],
        });
        const { replies } = await execute({ sock });
        assert.equal(sock.calls.length, 1);
        assert.equal(sock.calls[0].jid, GROUP_JID);
        assert.equal(sock.calls[0].action, 'remove');
        assert.deepEqual(sock.calls[0].ids.sort(), [
            '333@s.whatsapp.net',
            '555@s.whatsapp.net',
        ]);
        assert.match(replies, /Rimossi 2 membri non amministratori/);
    });

    it('non fa nulla se sono rimasti solo amministratori', async () => {
        const sock = makeSock({
            participants: [
                { id: BOT_ID, admin: 'admin' },
                { id: '222@s.whatsapp.net', admin: 'admin' },
            ],
        });
        const { replies } = await execute({ sock });
        assert.equal(sock.calls.length, 0);
        assert.match(replies, /Non ci sono membri non amministratori/);
    });

    it('riconosce il bot anche con il suffisso dispositivo', async () => {
        const sock = makeSock({
            userId: '111:12@s.whatsapp.net',
            participants: [
                { id: BOT_ID, admin: 'admin' },
                { id: '333@s.whatsapp.net' },
            ],
        });
        const { replies } = await execute({ sock });
        assert.equal(sock.calls.length, 1);
        assert.match(replies, /Rimossi 1 membri non amministratori/);
    });

    it('segnala se non riesce a leggere il gruppo', async () => {
        const sock = makeSock({ metadataError: new Error('boom') });
        const { replies } = await execute({ sock });
        assert.match(replies, /Non riesco a leggere/);
        assert.equal(sock.calls.length, 0);
    });

    it('segnala se la rimozione fallisce', async () => {
        const sock = makeSock({
            participants: [
                { id: BOT_ID, admin: 'admin' },
                { id: '333@s.whatsapp.net' },
            ],
            updateError: new Error('boom'),
        });
        const { replies } = await execute({ sock });
        assert.match(replies, /Non sono riuscito/);
    });
});
