import type { Command } from '../types.js';
import type { LeaderboardEntry } from '../../services/rpg/types.js';

const SIGNATURE = '╰━━━━━━━━ ✨ GG BOT ✨ ━━━━━━━━╯';

const MEDALS = ['🥇', '🥈', '🥉'];

type LeaderboardCategory = 'livello' | 'vittorie' | 'ricchezza';

const VALID_CATEGORIES: ReadonlySet<string> = new Set(['livello', 'vittorie', 'ricchezza']);

function formatLevel(entry: LeaderboardEntry): string {
  return `Livello ${entry.level}`;
}

function formatWins(entry: LeaderboardEntry): string {
  return `${entry.wins} vittorie`;
}

function formatWealth(entry: LeaderboardEntry): string {
  return `🪙 ${entry.walletCoins + entry.bankCoins}`;
}

function renderRanking(
  entries: readonly LeaderboardEntry[],
  nameResolver: (userId: string) => string,
  formatter: (entry: LeaderboardEntry) => string,
): string {
  if (entries.length === 0) return '  Nessun giocatore nella classifica.';
  return entries
    .map((entry, i) => {
      const medal = MEDALS[i] ?? `#${i + 1}`;
      const name = nameResolver(entry.userId);
      return `${medal} @${name} — ${formatter(entry)}`;
    })
    .join('\n');
}

function renderCategory(
  title: string,
  entries: readonly LeaderboardEntry[],
  nameResolver: (userId: string) => string,
  formatter: (entry: LeaderboardEntry) => string,
): string {
  return [title, '', renderRanking(entries, nameResolver, formatter)].join('\n');
}

export default {
  name: 'classifica',
  category: 'rpg',
  emoji: '🏆',
  description: 'Mostra le classifiche dei giocatori',
  execute: async ({ args, rpg, reply }) => {
    const rawArg = args[0]?.toLowerCase();
    const category: LeaderboardCategory | null =
      rawArg && VALID_CATEGORIES.has(rawArg) ? (rawArg as LeaderboardCategory) : null;

    const nameResolver = (userId: string) => rpg.getPlayerName(userId);
    const lines: string[] = [
      '╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮',
      '┃      🏆 CLASSIFICHE      ┃',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    ];

    const showAll = category === null;
    const showLevel = showAll || category === 'livello';
    const showWins = showAll || category === 'vittorie';
    const showWealth = showAll || category === 'ricchezza';

    if (showLevel) {
      const entries = rpg.getLeaderboardByLevel();
      lines.push('');
      lines.push(renderCategory('⭐ LIVELLO', entries, nameResolver, formatLevel));
    }

    if (showWins) {
      const entries = rpg.getLeaderboardByWins();
      lines.push('');
      lines.push(renderCategory('⚔️ VITTORIE', entries, nameResolver, formatWins));
    }

    if (showWealth) {
      const entries = rpg.getLeaderboardByWealth();
      lines.push('');
      lines.push(renderCategory('🪙 RICCHEZZA', entries, nameResolver, formatWealth));
    }

    lines.push('');
    lines.push(SIGNATURE);

    await reply(lines.join('\n'));
  },
} satisfies Command;
