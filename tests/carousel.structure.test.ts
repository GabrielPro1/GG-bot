import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { proto, generateWAMessageFromContent } from '@whiskeysockets/baileys';

interface Row {
  title: string;
  rowId: string;
  description?: string;
}

interface Section {
  title: string;
  rows: readonly Row[];
}

function buildCarousel(text: string, footer: string, buttonText: string, sections: readonly Section[]): proto.IMessage {
  const cards = sections.map((section) => {
    const buttonParamsJson = JSON.stringify({
      title: buttonText,
      sections: [
        {
          title: section.title,
          rows: section.rows.map((row) => ({
            title: row.title,
            description: row.description,
            id: row.rowId,
          })),
        },
      ],
    });
    return {
      header: {
        title: section.title,
        hasMediaAttachment: true,
        imageMessage: { url: 'https://example.invalid/menuimage.png' },
      },
      body: { text: `${section.rows.length} comandi disponibili` },
      footer: { text },
      nativeFlowMessage: {
        buttons: [{ name: 'single_select', buttonParamsJson }],
        messageVersion: 1,
      },
    };
  });

  return proto.Message.create({
    interactiveMessage: {
      carouselMessage: {
        cards,
        messageVersion: 1,
        carouselCardType:
          proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType.HSCROLL_CARDS,
      },
      body: { text },
      footer: { text },
    },
  });
}

describe('Carousel menu payload structure (Baileys 7.0.0-rc14)', () => {
  it('builds a serializable interactive carousel with single_select cards', () => {
    const sections: readonly Section[] = [
      {
        title: 'CORE',
        rows: [
          { title: '⚙️ /ping', rowId: '/ping', description: 'Ping' },
          { title: '📖 /menu', rowId: '/menu', description: 'Menu' },
        ],
      },
      {
        title: 'RPG',
        rows: [{ title: '🎮 /profilo', rowId: '/profilo', description: 'Profilo' }],
      },
    ];

    const msg = buildCarousel('Seleziona', 'GG Bot', '📋 Apri Menu', sections);

    const full = generateWAMessageFromContent('123456@s.whatsapp.net', msg, {
      userJid: '999999999@s.whatsapp.net',
    });

    const out = msg.interactiveMessage!;
    assert.ok(out.carouselMessage, 'interactiveMessage must contain carouselMessage');
    assert.equal(out.carouselMessage.messageVersion, 1);
    assert.equal(out.carouselMessage.carouselCardType, 1);
    assert.equal(out.carouselMessage.cards?.length, 2);

    const first = out.carouselMessage.cards![0];
    assert.ok(first.nativeFlowMessage, 'each card must have nativeFlowMessage');
    assert.equal(first.nativeFlowMessage.messageVersion, 1);
    assert.equal(first.nativeFlowMessage.buttons?.[0]?.name, 'single_select');

    const params = JSON.parse(first.nativeFlowMessage.buttons![0].buttonParamsJson!);
    assert.equal(params.title, '📋 Apri Menu');
    assert.equal(params.sections[0].rows.length, 2);
    assert.equal(params.sections[0].rows[0].id, '/ping');

    // each card must expose its OWN rows and a distinct derived body
    const second = out.carouselMessage.cards![1];
    const firstParams = JSON.parse(first.nativeFlowMessage!.buttons![0].buttonParamsJson!);
    const secondParams = JSON.parse(second.nativeFlowMessage!.buttons![0].buttonParamsJson!);
    assert.deepEqual(firstParams.sections[0].title, 'CORE');
    assert.deepEqual(secondParams.sections[0].title, 'RPG');
    assert.equal(firstParams.sections[0].rows.length, 2);
    assert.equal(secondParams.sections[0].rows.length, 1);
    assert.notEqual(first.body?.text, second.body?.text);
    assert.equal(first.body?.text, '2 comandi disponibili');

    assert.equal(full.key.remoteJid, '123456@s.whatsapp.net');
    assert.ok(full.message?.interactiveMessage?.carouselMessage, 'generated message serializes carousel');
    assert.ok(proto.Message.encode(msg).finish().length > 0, 'proto message encodes without error');
  });
});
