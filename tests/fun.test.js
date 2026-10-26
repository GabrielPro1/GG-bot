import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandRegistry } from '../lib/commands/registry.js';
import { COMMAND_ALIASES } from '../lib/commands/aliases.js';
import { buildMenuSections } from '../lib/commands/menu-sections.js';
import dado from '../plugins/fun/dado.js';
import moneta from '../plugins/fun/moneta.js';
import eightBall from '../plugins/fun/8ball.js';
import barzelletta from '../plugins/fun/barzelletta.js';
import complimento from '../plugins/fun/complimento.js';
import ship from '../plugins/fun/ship.js';

const COMMANDS = [dado, moneta, eightBall, barzelletta, complimento, ship];

async function run(command, { args = [], mentions = [] } = {}) {
    const replies = [];
    await command.execute({
        args,
        mentions,
        reply: async (text) => replies.push(text),
    });
    return replies.join('\n');
}

describe('fun commands', () => {
    it('expose category, emoji and description and register without conflicts', () => {
        const registry = new CommandRegistry(COMMAND_ALIASES);
        for (const command of COMMANDS) {
            assert.equal(command.category, 'fun');
            assert.ok(command.emoji, `${command.name} needs an emoji`);
            assert.ok(command.description, `${command.name} needs a description`);
            const result = registry.register(command);
            assert.equal(result.ok, true, `${command.name} should register: ${result.error}`);
        }
        assert.equal(registry.get('dice')?.name, 'dado');
        assert.equal(registry.get('flip')?.name, 'moneta');
        assert.equal(registry.get('sfera')?.name, '8ball');
        assert.equal(registry.get('joke')?.name, 'barzelletta');
        assert.equal(registry.get('complimenti')?.name, 'complimento');
        assert.equal(registry.get('amore')?.name, 'ship');
    });

    it('groups all fun commands under the FUN menu section', () => {
        const registry = new CommandRegistry();
        for (const command of COMMANDS)
            registry.register(command);
        const section = buildMenuSections(registry).find((entry) => entry.key === 'fun');
        assert.ok(section, 'FUN section must exist');
        assert.equal(section.title, '😂 FUN');
        assert.deepEqual(
            section.rows.map((row) => row.rowId),
            ['/8ball', '/barzelletta', '/complimento', '/dado', '/moneta', '/ship'],
        );
    });

    it('rolls a die with the requested number of faces', async () => {
        const output = await run(dado, { args: ['20'] });
        const match = output.match(/Risultato: \*(\d+)\*/);
        assert.ok(match, `unexpected output: ${output}`);
        const result = Number(match[1]);
        assert.ok(result >= 1 && result <= 20, `result ${result} is outside 1-20`);
        assert.match(output, /DADO A 20 FACCE/);
        assert.match(await run(dado), /DADO A 6 FACCE/);
        assert.match(await run(dado, { args: ['d8'] }), /DADO A 8 FACCE/);
    });

    it('rejects invalid die faces instead of rolling', async () => {
        for (const value of ['1', '0', 'abc', '1001', '2.5']) {
            const output = await run(dado, { args: [value] });
            assert.match(output, /non valido/, `"${value}" should be rejected`);
        }
    });

    it('always returns a valid coin side', async () => {
        for (let i = 0; i < 10; i += 1) {
            const output = await run(moneta);
            assert.match(output, /È uscito: \*(Testa|Croce)\*/);
        }
    });

    it('asks for a question before answering with the 8-ball', async () => {
        assert.match(await run(eightBall), /Fai una domanda/);
        const output = await run(eightBall, { args: ['Sono', 'pronto?'] });
        assert.match(output, /❓ Sono pronto\?/);
        assert.match(output, /💬 /);
    });

    it('tells a joke with the bot signature', async () => {
        const output = await run(barzelletta);
        assert.match(output, /😂 \*BARZELLETTA\*/);
        assert.match(output, /GG BOT/);
    });

    it('addresses an explicit name or a mentioned user in compliments', async () => {
        assert.match(await run(complimento, { args: ['Luca'] }), /COMPLIMENTO PER Luca/);
        assert.match(await run(complimento), /UN COMPLIMENTO PER TE/);
        const mentioned = await run(complimento, {
            mentions: [{ jid: '123@s.whatsapp.net', identity: { username: 'anna' } }],
        });
        assert.match(mentioned, /COMPLIMENTO PER anna/);
    });

    it('ships two names with a stable percentage', async () => {
        const first = await run(ship, { args: ['Mario', 'Giulia'] });
        const second = await run(ship, { args: ['Mario', 'Giulia'] });
        assert.equal(first, second, 'the same pair must always produce the same result');
        assert.match(first, /\*Mario\* ❤️ \*Giulia\*/);
        const match = first.match(/\[[█░]{10}\] (\d{1,3})%/);
        assert.ok(match, `missing percentage in: ${first}`);
        const percentage = Number(match[1]);
        assert.ok(percentage >= 0 && percentage <= 100);
        assert.match(first, /Anime gemelle|Amore quasi perfetto|Scintille nell'aria|bella intesa|Amicizia con potenziale|non c'è chimica/);
    });

    it('supports mentions and asks for names when they are missing', async () => {
        const mentioned = await run(ship, {
            mentions: [
                { jid: '111@s.whatsapp.net', identity: { username: 'anna' } },
                { jid: '222@s.whatsapp.net', identity: { username: 'marco' } },
            ],
        });
        assert.match(mentioned, /\*anna\* ❤️ \*marco\*/);
        assert.match(mentioned, /%/);

        const missing = await run(ship, { args: ['Mario'] });
        assert.match(missing, /Scrivi due nomi/);
    });
});
