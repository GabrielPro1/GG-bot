import type { EquipResult } from '../../services/rpg/types.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const BOX_TITLE = [
  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
  '┃     ⚔️ EQUIPAGGIA     ┃',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
];

type EquipFailure = Extract<EquipResult, { ok: false }>;

function renderFailure(result: EquipFailure): string {
  switch (result.error) {
    case 'unknown_item':
      return [
        ...BOX_TITLE,
        '',
        '❌ Questo oggetto non esiste.',
        '',
        '💡 Controlla il /negozio e riprova!',
        '',
        SIGNATURE,
      ].join('\n');
    case 'not_equippable':
      return [
        ...BOX_TITLE,
        '',
        `${result.item.emoji} ${result.item.name} non può essere equipaggiata.`,
        '',
        '💡 Se è consumabile puoi usarla con:',
        '',
        `/usa ${result.item.id}`,
        '',
        SIGNATURE,
      ].join('\n');
    case 'not_in_inventory':
      return [
        ...BOX_TITLE,
        '',
        '❌ Non possiedi questo oggetto.',
        '',
        '💡 Puoi acquistarlo con:',
        '',
        '/negozio',
        '',
        SIGNATURE,
      ].join('\n');
    case 'already_equipped':
      return [
        ...BOX_TITLE,
        '',
        `${result.item.emoji} Hai già questo oggetto equipaggiato (${result.item.name}).`,
        '',
        SIGNATURE,
      ].join('\n');
  }
}

export default {
  name: 'equipaggia',
  category: 'rpg',
  emoji: '⚔️',
  description: 'Equipaggia un oggetto',
  execute: async ({ args, identity, rpg, reply }) => {
    const itemId = args[0];
    if (!itemId) {
      await reply([
        ...BOX_TITLE,
        '',
        '⚔️ Usa:',
        '',
        '/equipaggia <oggetto>',
        '',
        '💡 Consulta il /negozio per gli oggetti disponibili.',
        '',
        SIGNATURE,
      ].join('\n'));
      return;
    }

    const result: EquipResult = rpg.equipItem(identity.userId, itemId);
    if (!result.ok) {
      await reply(renderFailure(result));
      return;
    }

    await reply([
      ...BOX_TITLE,
      '',
      `✅ Hai equipaggiato:`,
      `   ${result.item.emoji} ${result.item.name}`,
      result.item.effectDescription ? `   ${result.item.effectEmoji ?? ''} ${result.item.effectDescription}` : '',
      '',
      SIGNATURE,
    ].filter((line) => line !== '').join('\n'));
  },
} satisfies Command;
