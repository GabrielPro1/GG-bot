import {
  isJidStatusBroadcast,
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadMediaMessage,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CommandDispatcher } from '../commands/dispatcher.js';
import type { MentionedUser } from '../commands/types.js';
import type { IdentityService } from '../services/identity/identity.service.js';
import type { AIServiceView } from '../services/ai/types.js';
import { disabledAiView } from '../services/ai/ai.service.js';
import { handleAiModeMessage, type AiModeImage } from '../services/ai/ai-mode.js';

const TEXT_PREVIEW_MAX_LENGTH = 100;
const MENU_IMAGE_PATH = fileURLToPath(new URL('../../assets/menuimage.png', import.meta.url));
/** Upper bound for image bytes sent to Gemini (inline data limit is ~20MB). */
const MAX_AI_IMAGE_BYTES = 20_000_000;
const AI_IMAGE_ERROR = '⚠️ Non è stato possibile scaricare l\'immagine. Riprova.';

interface MessageSummary {
  kind: string;
  preview?: string;
}

function extractMentionedJids(message: WAMessage['message']): readonly string[] {
  const mentionedJid = message?.extendedTextMessage?.contextInfo?.mentionedJid;
  return mentionedJid ?? [];
}

function resolveMentions(
  identityService: IdentityService,
  message: WAMessage['message'],
): MentionedUser[] {
  return extractMentionedJids(message).map((jid) => ({
    jid,
    identity: identityService.fromJid(jid),
  }));
}

function resolveQuoted(
  identityService: IdentityService,
  message: WAMessage['message'],
): MentionedUser | null {
  const contextInfo = message?.extendedTextMessage?.contextInfo;
  if (!contextInfo) return null;
  const quotedJid = contextInfo.participant ?? contextInfo.remoteJid ?? null;
  if (!quotedJid) return null;
  return {
    jid: quotedJid,
    identity: identityService.fromJid(quotedJid),
  };
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
  if (message.listResponseMessage) {
    const rowId = message.listResponseMessage.singleSelectReply?.selectedRowId;
    return { kind: 'list-response', preview: rowId ? truncateText(rowId) : undefined };
  }
  if (message.interactiveResponseMessage) {
    const paramsJson =
      message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson;
    if (paramsJson) {
      try {
        const params = JSON.parse(paramsJson);
        const id: string | undefined = params.selected_id ?? params.id;
        return { kind: 'interactive-response', preview: id ? truncateText(id) : truncateText(paramsJson) };
      } catch {
        return { kind: 'interactive-response', preview: truncateText(paramsJson) };
      }
    }
    return { kind: 'interactive-response' };
  }
  const firstSetKey = Object.keys(message).find(
    (key) => (message as Record<string, unknown>)[key] != null,
  );
  return { kind: firstSetKey ?? 'unknown' };
}

function extractText(message: WAMessage['message']): string | null {
  if (message?.conversation) return message.conversation;
  if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return message.listResponseMessage.singleSelectReply.selectedRowId;
  }
  if (message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const params = JSON.parse(
        message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson,
      );
      return params.selected_id ?? params.id ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

function isImageMessage(message: WAMessage['message']): boolean {
  return message?.imageMessage != null;
}

/**
 * Downloads the image bytes of a received message in memory (never persisted to
 * disk). Returns null when the message has no image, is too large, or fails to
 * download. Does NOT log binary content or credentials.
 */
async function tryDownloadImage(
  message: WAMessage,
): Promise<AiModeImage | null> {
  const imageMessage = message.message?.imageMessage;
  if (!imageMessage) return null;

  if (typeof imageMessage.fileLength === 'number' && imageMessage.fileLength > MAX_AI_IMAGE_BYTES) {
    return null;
  }

  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {});
    if (!buffer || buffer.byteLength === 0) return null;
    if (buffer.byteLength > MAX_AI_IMAGE_BYTES) return null;
    return {
      mimeType: imageMessage.mimetype ?? 'image/jpeg',
      data: buffer,
    };
  } catch (error) {
    console.error('[ai] failed to download image:', error instanceof Error ? error.message : error);
    return null;
  }
}

export function registerMessageLogger(
  sock: WASocket,
  identityService: IdentityService,
  dispatcher: CommandDispatcher,
  ai: AIServiceView = disabledAiView(),
): void {
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const message of messages) {
      void handleMessage(message, type);
    }
  });

  async function handleMessage(message: WAMessage, type: string): Promise<void> {
    try {
      if (message.key.fromMe) return;

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
      if (!chatJid || isJidStatusBroadcast(chatJid)) return;
      if (!identity) return;

      const text = extractText(message.message);

      if (ai.enabled && ai.activeChat(identity.userId) !== null) {
        let image: AiModeImage | null = null;
        if (isImageMessage(message.message) && type === 'notify') {
          image = await tryDownloadImage(message);
          if (image === null) {
            await sock.sendMessage(chatJid, { text: AI_IMAGE_ERROR });
            return;
          }
        }

        const routed = await handleAiModeMessage({
          ai,
          userId: identity.userId,
          text,
          image,
          reply: (replyText) =>
            sock.sendMessage(chatJid, { text: replyText }).then(() => undefined),
        });
        if (routed === 'ai') return;
      }

      if (!text || type !== 'notify') return;

      await dispatcher
        .handle(text, {
          identity,
          reply: (replyText) =>
            sock.sendMessage(chatJid, { text: replyText }).then(() => undefined),
          sendList: async (options) => {
            const imageBuffer = await readFile(MENU_IMAGE_PATH);
            const { imageMessage } = await prepareWAMessageMedia(
              { image: imageBuffer },
              { upload: sock.waUploadToServer, mediaUploadTimeoutMs: 30_000 },
            );
            const cards = options.sections.map((section) => {
              const buttonParamsJson = JSON.stringify({
                title: options.buttonText,
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
                  imageMessage,
                },
                body: {
                  text: [
                    section.title,
                    `${section.rows.length} ${
                      section.rows.length === 1 ? 'comando' : 'comandi'
                    } ${section.rows.length === 1 ? 'disponibile' : 'disponibili'}`,
                  ].join('\n'),
                },
                footer: { text: options.footer },
                nativeFlowMessage: {
                  buttons: [{ name: 'single_select', buttonParamsJson }],
                  messageVersion: 1,
                },
              };
            });
            const interactiveMsg = proto.Message.create({
              interactiveMessage: {
                carouselMessage: {
                  cards,
                  messageVersion: 1,
                  carouselCardType:
                    proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType
                      .HSCROLL_CARDS,
                },
                body: { text: options.text },
                footer: { text: options.footer },
              },
            });
            const fullMsg = generateWAMessageFromContent(chatJid, interactiveMsg, {
              userJid: sock.user?.id ?? '',
            });
            await sock.relayMessage(chatJid, fullMsg.message!, {
              messageId: fullMsg.key.id!,
            });
          },
          mentions: resolveMentions(identityService, message.message),
          quoted: resolveQuoted(identityService, message.message),
        });
    } catch (error: unknown) {
      console.error('Failed to process message:', error);
    }
  }
}
