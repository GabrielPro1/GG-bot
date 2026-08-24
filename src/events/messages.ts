import { isJidStatusBroadcast, type WAMessage, type WASocket } from '@whiskeysockets/baileys';
import type { CommandDispatcher } from '../commands/dispatcher.js';
import type { IdentityService } from '../services/identity/identity.service.js';

const TEXT_PREVIEW_MAX_LENGTH = 100;

interface MessageSummary {
  kind: string;
  preview?: string;
}

function truncateText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > TEXT_PREVIEW_MAX_LENGTH
    ? `${normalized.slice(0, TEXT_PREVIEW_MAX_LENGTH)}…`
    : normalized;
}

function captionPreview(caption: string | null | undefined): string | undefined {
  return caption ? truncateText(caption) : undefined;
}

function summarizeMessage(message: WAMessage['message']): MessageSummary {
  if (!message) return { kind: 'empty' };
  if (message.conversation) return { kind: 'text', preview: truncateText(message.conversation) };
  if (message.extendedTextMessage?.text) {
    return { kind: 'text', preview: truncateText(message.extendedTextMessage.text) };
  }
  if (message.imageMessage) {
    return { kind: 'image', preview: captionPreview(message.imageMessage.caption) };
  }
  if (message.videoMessage) {
    return { kind: 'video', preview: captionPreview(message.videoMessage.caption) };
  }
  if (message.documentMessage) {
    return { kind: 'document', preview: captionPreview(message.documentMessage.caption) };
  }
  if (message.audioMessage) return { kind: 'audio' };
  if (message.stickerMessage) return { kind: 'sticker' };
  if (message.contactMessage) return { kind: 'contact' };
  if (message.locationMessage) return { kind: 'location' };
  if (message.liveLocationMessage) return { kind: 'live-location' };
  if (message.pollCreationMessage) return { kind: 'poll' };
  if (message.reactionMessage) return { kind: 'reaction' };
  const firstSetKey = Object.keys(message).find(
    (key) => (message as Record<string, unknown>)[key] != null,
  );
  return { kind: firstSetKey ?? 'unknown' };
}

function extractText(message: WAMessage['message']): string | null {
  if (message?.conversation) return message.conversation;
  if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
  return null;
}

export function registerMessageLogger(
  sock: WASocket,
  identityService: IdentityService,
  dispatcher: CommandDispatcher,
): void {
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const message of messages) {
      if (message.key.fromMe) continue;

      const summary = summarizeMessage(message.message);
      const origin = type === 'notify' ? 'incoming' : `history (${type})`;
      const identity = identityService.fromMessage(message);
      const lines = [
        `${origin}:`,
        `  id             : ${message.key.id ?? '-'}`,
        `  remoteJid      : ${message.key.remoteJid ?? '-'}`,
        `  remoteJidAlt   : ${message.key.remoteJidAlt ?? '-'}`,
        `  participant    : ${message.key.participant ?? '-'}`,
        `  participantAlt : ${message.key.participantAlt ?? '-'}`,
        `  messageType    : ${summary.kind}`,
        `  senderUserId   : ${identity?.userId ?? '-'}`,
        `  senderLid      : ${identity?.lid ?? '-'}`,
        `  senderPn       : ${identity?.pn ?? '-'}`,
      ];
      if (identity?.username) {
        lines.push(`  senderUsername : ${identity.username}`);
      }
      if (summary.preview !== undefined) {
        lines.push(`  content        : ${summary.preview}`);
      }
      console.log(lines.join('\n'));

      const chatJid = message.key.remoteJid;
      if (!chatJid || isJidStatusBroadcast(chatJid)) continue;
      if (!identity) continue;

      const text = extractText(message.message);
      if (!text || type !== 'notify') continue;

      void dispatcher
        .handle(text, {
          identity,
          reply: (replyText) =>
            sock.sendMessage(chatJid, { text: replyText }).then(() => undefined),
        })
        .catch((error: unknown) => {
          console.error('Failed to dispatch command:', error);
        });
    }
  });
}
