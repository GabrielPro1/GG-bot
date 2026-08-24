import type { Command } from '../types.js';

export default {
  name: 'ping',
  category: 'core',
  execute: async ({ reply }) => {
    await reply('pong');
  },
} satisfies Command;
