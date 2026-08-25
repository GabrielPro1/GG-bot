import type { UseItemResult } from '../../services/rpg/types.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';
const BOX_TITLE = [
  '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
  '┃        🧪 USA         ┃',
  '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
];

type UseFailure = Extract<UseItemResult, { ok: false }>;

function renderFailure(result: UseFailure): string {
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
    case 'not_consumable':
      return [
        ...BOX_TITLE,
        '',
        `${result.item.emoji} ${result.item.name} non è utilizzabile direttamente.`,
        '',
        result.item.type === 'weapon' || result.item.type === 'armor' || result.item.type === 'accessory'
          ? `💡 Se lo possiedi puoi equipaggiarlo con:\n\n/equipaggia ${result.item.id}`
          : SIGNATURE,
        '',
        SIGNATURE,
      ].join('\n');
    case 'not_in_inventory':
      return [
        ...BOX_TITLE,
        '',
        `❌ Non possiedi: ${result.item.name}.`,
        '',
        '💡 Puoi acquistarlo con:',
        '',
        '/negozio',
        '',
        SIGNATURE,
      ].join('\n');
    case 'energy_full':
      return [
        ...BOX_TITLE,
        '',
        '❤️ La tua energia è già al massimo.',
        '',
        `${result.item.emoji} ${result.item.name} non è stata consumata.`,
        '',
        SIGNATURE,
      ].join('\n');
  }
}

export default {
  name: 'usa',
  category: 'rpg',
  emoji: '🧪',
  description: 'Usa un oggetto consumabile',
  execute: async ({ args, identity, rpg, reply }) => {
    const itemId = args[0];
    if (!itemId) {
      await reply([
        ...BOX_TITLE,
        '',
        '🧪 Usa:',
        '',
        '/usa <oggetto>',
        '',
        '💡 Consulta il /negozio per gli oggetti disponibili.',
        '',
        SIGNATURE,
      ].join('\n'));
      return;
    }

    const result: UseItemResult = rpg.useItem(identity.userId, itemId);
    if (!result.ok) {
      await reply(renderFailure(result));
      return;
    }

    await reply([
      ...BOX_TITLE,
      '',
      `✅ Hai usato:`,
      `   ${result.item.emoji} ${result.item.name}`,
      '',
      `❤️ Energia: ${result.energy} / ${result.maxEnergy}`,
      `🎒 Rimasti: ×${result.remainingQuantity}`,
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
