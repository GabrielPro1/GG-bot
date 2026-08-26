import { findItemById } from '../../services/rpg/items/catalog.js';
import { getRarityInfo } from '../../services/rpg/items/rarity.js';
import type { HuntLootEntry, HuntResult } from '../../services/rpg/types.js';
import type { Command } from '../types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

function formatLootLine(entry: HuntLootEntry): string {
  const item = findItemById(entry.itemId);
  if (!item) {
    return `${entry.itemId} ×${entry.quantity}`;
  }
  const rarity = getRarityInfo(item.rarity);
  return `${rarity.emoji} ${rarity.name}\n${item.emoji} ${item.name} ×${entry.quantity}`;
}

function renderLootSection(loot: HuntLootEntry[]): string[] {
  if (loot.length === 0) {
    return ['🎁 Nessun bottino trovato.', ''];
  }
  return [
    '🎁 BOTTINO',
    ...loot.map((entry) => formatLootLine(entry)),
    '',
  ];
}

function formatCooldown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function renderError(title: string, message: string): string {
  return [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    `┃   ${title}   ┃`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    message,
    '',
    SIGNATURE,
  ].join('\n');
}

type FailureRenderer = (result: Extract<HuntResult, { ok: false }>) => string;

const FAILURE_RENDERERS: Record<string, FailureRenderer> = {
  cooldown: (result) =>
    renderError(
      '⏳ ASPETTA',
      [
        '⏳ Sei ancora in caccia!',
        '',
        '🏹 Potrai cacciare di nuovo tra:',
        formatCooldown(result.remainingMs ?? 0),
      ].join('\n'),
    ),
  insufficient_energy: (result) =>
    renderError(
      '😴 TROPPO STANCO',
      [
        '❌ Non hai abbastanza energia per cacciare!',
        '',
        '❤️ Energia richiesta: 20',
        `⚡ Energia disponibile: ${result.energy ?? 0}`,
        '',
        '💡 Recupera energia oppure usa una 🧪 pozione.',
      ].join('\n'),
    ),
};

function renderHuntOutcome(result: Extract<HuntResult, { ok: true }>): string {
  const header = [
    '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
    '┃      🏹 CACCIA PvE      ┃',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `${result.monsterEmoji} Hai incontrato:`,
    `   ${result.monsterName}`,
    '',
  ];

  if (result.outcome === 'victory') {
    return [
      ...header,
      '⚔️ IL DUELLO!',
      '',
      '👤 Tu',
      `⚔️ Danno: ${result.playerDamage}`,
      ...(result.critical ? ['💥 Critico!'] : []),
      '',
      `${result.monsterEmoji} ${result.monsterName}`,
      `⚔️ Danno: ${result.monsterDamage}`,
      '',
      '🏆 VITTORIA!',
      '',
      `💰 Ricompensa: 🪙 +${result.rewardCoins}`,
      `✨ Esperienza: +${result.rewardXp} XP`,
      '',
      ...renderLootSection(result.loot),
      `❤️ Energia: ${result.energy} / ${result.maxEnergy}`,
      '',
      `⏳ Prossima caccia tra: ${formatCooldown(result.cooldownUntil - Date.now())}`,
      '',
      SIGNATURE,
    ].join('\n');
  }

  return [
    ...header,
    '💀 SCONFITTA!',
    '',
    '⚔️ Il mostro era troppo forte.',
    '',
    `💥 Danno inflitto: ${result.playerDamage}`,
    `💔 Danno ricevuto: ${result.monsterDamage}`,
    '',
    `❤️ Energia: ${result.energy} / ${result.maxEnergy}`,
    '',
    `⏳ Prossima caccia tra: ${formatCooldown(result.cooldownUntil - Date.now())}`,
    '',
    SIGNATURE,
  ].join('\n');
}

export default {
  name: 'caccia',
  category: 'rpg',
  emoji: '🏹',
  description: 'Caccia un mostro e conquista ricompense',
  execute: async ({ identity, rpg, reply }) => {
    const result = rpg.hunt(identity.userId);

    if (!result.ok) {
      await reply(FAILURE_RENDERERS[result.reason](result));
      return;
    }

    await reply(renderHuntOutcome(result));
  },
} satisfies Command;
