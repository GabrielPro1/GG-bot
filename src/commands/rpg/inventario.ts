import { getAllItems } from '../../services/rpg/items/catalog.js';
import { getRarityInfo } from '../../services/rpg/items/rarity.js';
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
        const rarity = getRarityInfo(item.rarity);
        const lines = [`${rarity.emoji} ${rarity.name}`, `${item.emoji} ${item.name} ×${inventory[item.id]}`];
        if (equippedIds.has(item.id)) {
          lines.push('   ✅ Equipaggiata');
        }
        return lines.join('\n');
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
