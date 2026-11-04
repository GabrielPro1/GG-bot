import { isJidGroup } from '@whiskeysockets/baileys';

const REMOVE_BATCH_SIZE = 50;

function bareJid(jid) {
    const value = String(jid ?? '');
    const at = value.indexOf('@');
    if (at === -1)
        return value;
    const user = value.slice(0, at).split(':')[0];
    return `${user}${value.slice(at)}`;
}

function sameJid(a, b) {
    if (!a || !b)
        return false;
    return bareJid(a) === bareJid(b);
}

function isAdmin(participant) {
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

export default {
    name: 'nuke',
    category: 'group',
    emoji: '☢️',
    ownerOnly: true,
    description: 'Rimuove tutti i membri non amministratori dal gruppo',
    execute: async ({ sock, chatJid, isGroup, reply }) => {
        if (!sock ||
            typeof sock.groupMetadata !== 'function' ||
            typeof sock.groupParticipantsUpdate !== 'function') {
            return reply('⚠️ /nuke funziona solo da WhatsApp.');
        }
        if (!isGroup || !chatJid || !isJidGroup(chatJid)) {
            return reply('⚠️ /nuke va usato dentro un gruppo.');
        }

        let metadata;
        try {
            metadata = await sock.groupMetadata(chatJid);
        }
        catch (error) {
            console.error('[nuke] groupMetadata failed:', error instanceof Error ? error.message : error);
            return reply('❌ Non riesco a leggere i membri del gruppo.');
        }

        const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
        const myIds = [sock.user?.id, sock.user?.lid].filter(Boolean);
        const me = participants.find((participant) => myIds.some((id) => sameJid(participant.id, id)));
        if (!isAdmin(me)) {
            return reply('❌ Devo essere amministratore del gruppo per poter rimuovere i membri.');
        }

        const targets = participants
            .filter((participant) => !isAdmin(participant))
            .map((participant) => participant.id)
            .filter((id) => !myIds.some((mine) => sameJid(id, mine)));

        if (targets.length === 0) {
            return reply('✅ Non ci sono membri non amministratori da rimuovere.');
        }

        let removed = 0;
        for (let index = 0; index < targets.length; index += REMOVE_BATCH_SIZE) {
            const batch = targets.slice(index, index + REMOVE_BATCH_SIZE);
            try {
                await sock.groupParticipantsUpdate(chatJid, batch, 'remove');
                removed += batch.length;
            }
            catch (error) {
                console.error('[nuke] remove failed:', error instanceof Error ? error.message : error);
            }
        }

        const failed = targets.length - removed;
        if (removed === 0) {
            return reply('❌ Non sono riuscito a rimuovere nessun membro.');
        }
        const lines = [`☢️ Rimossi ${removed} membri non amministratori.`];
        if (failed > 0) {
            lines.push(`⚠️ ${failed} non rimossi: controlla i permessi e riprova.`);
        }
        return reply(lines.join('\n'));
    },
};
