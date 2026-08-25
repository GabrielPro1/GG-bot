import { findItemById } from '../../services/rpg/items/catalog.js';
import type { EquipSlot } from '../../services/rpg/types.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: '⚔️ Arma',
  armor: '🛡️ Armatura',
  accessory: '🍀 Accessorio',
};

const EMPTY_SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: 'Nessuna',
  armor: 'Nessuna',
  accessory: 'Nessuno',
};

const SLOT_BONUS_EMOJI: Record<EquipSlot, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  accessory: '🍀',
};

export default {
  name: 'equipaggiamento',
  category: 'rpg',
  emoji: '🎒',
  description: "Visualizza l'equipaggiamento",
  execute: async ({ identity, rpg, reply }) => {
    const equipment = rpg.getEquipment(identity.userId);

    const slotLines: string[] = [];
    const bonusLines: string[] = [];
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      const equippedId = equipment[slot];
      if (!equippedId) {
        slotLines.push(SLOT_LABELS[slot]);
        slotLines.push(`   ${EMPTY_SLOT_LABELS[slot]}`);
        continue;
      }
      const item = findItemById(equippedId);
      slotLines.push(SLOT_LABELS[slot]);
      slotLines.push(item ? `   ${item.emoji} ${item.name}` : `   ${equippedId}`);
      if (item?.effectDescription) {
        bonusLines.push(`${item.effectEmoji ?? SLOT_BONUS_EMOJI[slot]} ${item.effectDescription}`);
      }
    }

    if (bonusLines.length === 0) {
      bonusLines.push('Nessun bonus attivo');
    }

    await reply([
      '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
      '┃  🎒 EQUIPAGGIAMENTO  ┃',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      '',
      ...slotLines,
      '',
      '📊 BONUS ATTIVI',
      ...bonusLines,
      '',
      SIGNATURE,
    ].join('\n'));
  },
} satisfies Command;
