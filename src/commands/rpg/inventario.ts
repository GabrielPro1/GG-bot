import { getAllItems } from '../../services/rpg/items/catalog.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

export default {
  name: 'inventario',
  category: 'rpg',
  emoji: '🎒',
  description: 'Visualizza il tuo inventario',
  execute: async ({ identity, rpg, reply }) => {
    const inventory = rpg.getInventory(identity.userId);
    const equipment = rpg.getEquipment(identity.userId);
    const equippedIds = new Set(Object.values(equipment).filter((id): id is string => id !== null));

    const ownedEntries = getAllItems()
      .filter((item) => (inventory[item.id] ?? 0) > 0)
      .map((item) => {
        const line = `${item.emoji} ${item.name} ×${inventory[item.id]}`;
        return equippedIds.has(item.id) ? `${line}\n   ✅ Equipaggiata` : line;
      });

    if (ownedEntries.length === 0) {
      await reply([
        '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
        '┃    🎒 INVENTARIO    ┃',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
        '',
        '📦 Il tuo inventario è vuoto.',
        '',
        '🛒 Visita /negozio per acquistare',
        '   nuovi oggetti!',
        '',
        SIGNATURE,
      ].join('\n'));
      return;
    }

    await reply([
      '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
      '┃    🎒 INVENTARIO    ┃',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      ...ownedEntries.flatMap((entry, index) => (index === 0 ? [entry] : ['', entry])),
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
