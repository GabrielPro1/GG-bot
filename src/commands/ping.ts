import type { Command } from './types.js';

export const pingCommand: Command = {
  name: 'ping',
  async execute({ reply }) {
    await reply('pong');
  },
};
