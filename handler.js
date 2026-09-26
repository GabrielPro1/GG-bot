import { isJidGroup, isJidStatusBroadcast, proto, generateWAMessageFromContent, prepareWAMessageMedia, downloadMediaMessage, normalizeMessageContent, } from '@whiskeysockets/baileys';
import { disabledAiView } from './lib/ai/ai.service.js';
import { handleAiModeMessage } from './lib/ai/ai-mode.js';
import { loadMenuImage } from './lib/commands/menu-images.js';
import { renderSectionList } from './lib/commands/menu-text.js';
const TEXT_PREVIEW_MAX_LENGTH = 100;
/** Upper bound for image bytes sent to Gemini (inline data limit is ~20MB). */
const MAX_AI_IMAGE_BYTES = 20_000_000;
const AI_IMAGE_ERROR = '⚠️ Non è stato possibile scaricare l\'immagine. Riprova.';
function extractMentionedJids(message) {
    const mentionedJid = message?.extendedTextMessage?.contextInfo?.mentionedJid;
    return mentionedJid ?? [];
}
function resolveMentions(identityService, message) {
    return extractMentionedJids(message).map((jid) => ({
        jid,
        identity: identityService.fromJid(jid),
    }));
}
function resolveQuoted(identityService, message) {
    const contextInfo = message?.extendedTextMessage?.contextInfo;
    if (!contextInfo)
        return null;
    const quotedJid = contextInfo.participant ?? contextInfo.remoteJid ?? null;
    if (!quotedJid)
        return null;
    return {
        jid: quotedJid,
        identity: identityService.fromJid(quotedJid),
    };
}
function truncateText(text) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > TEXT_PREVIEW_MAX_LENGTH
        ? `${normalized.slice(0, TEXT_PREVIEW_MAX_LENGTH)}…`
        : normalized;
}
function captionPreview(caption) {
    return caption ? truncateText(caption) : undefined;
}
function summarizeMessage(message) {
    if (!message)
        return { kind: 'empty' };
    if (message.conversation)
        return { kind: 'text', preview: truncateText(message.conversation) };
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
    if (message.audioMessage)
        return { kind: 'audio' };
    if (message.stickerMessage)
        return { kind: 'sticker' };
    if (message.contactMessage)
        return { kind: 'contact' };
    if (message.locationMessage)
        return { kind: 'location' };
    if (message.liveLocationMessage)
        return { kind: 'live-location' };
    if (message.pollCreationMessage)
        return { kind: 'poll' };
    if (message.reactionMessage)
        return { kind: 'reaction' };
    if (message.listResponseMessage) {
        const rowId = message.listResponseMessage.singleSelectReply?.selectedRowId;
        return { kind: 'list-response', preview: rowId ? truncateText(rowId) : undefined };
    }
    if (message.interactiveResponseMessage) {
        const paramsJson = message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson;
        if (paramsJson) {
            try {
                const params = JSON.parse(paramsJson);
                const id = params.selected_id ?? params.id;
                return { kind: 'interactive-response', preview: id ? truncateText(id) : truncateText(paramsJson) };
            }
            catch {
                return { kind: 'interactive-response', preview: truncateText(paramsJson) };
            }
        }
        return { kind: 'interactive-response' };
    }
    if (message.templateButtonReplyMessage?.selectedId) {
        return {
            kind: 'template-button-reply',
            preview: truncateText(message.templateButtonReplyMessage.selectedId),
        };
    }
    const firstSetKey = Object.keys(message).find((key) => message[key] != null);
    return { kind: firstSetKey ?? 'unknown' };
}
function extractText(message) {
    const content = normalizeMessageContent(message);
    if (content?.conversation)
        return content.conversation;
    if (content?.extendedTextMessage?.text)
        return content.extendedTextMessage.text;
    if (content?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return content.listResponseMessage.singleSelectReply.selectedRowId;
    }
    if (content?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const params = JSON.parse(content.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            return params.selected_id ?? params.id ?? null;
        }
        catch {
            return null;
        }
    }
    if (content?.templateButtonReplyMessage?.selectedId) {
        return content.templateButtonReplyMessage.selectedId;
    }
    return null;
}
function isImageMessage(message) {
    return message?.imageMessage != null;
}
/**
 * Downloads the image bytes of a received message in memory (never persisted to
 * disk). Returns null when the message has no image, is too large, or fails to
 * download. Does NOT log binary content or credentials.
 */
async function tryDownloadImage(message) {
    const imageMessage = message.message?.imageMessage;
    if (!imageMessage)
        return null;
    if (typeof imageMessage.fileLength === 'number' && imageMessage.fileLength > MAX_AI_IMAGE_BYTES) {
        return null;
    }
    try {
        const buffer = await downloadMediaMessage(message, 'buffer', {});
        if (!buffer || buffer.byteLength === 0)
            return null;
        if (buffer.byteLength > MAX_AI_IMAGE_BYTES)
            return null;
        return {
            mimeType: imageMessage.mimetype ?? 'image/jpeg',
            data: buffer,
        };
    }
    catch (error) {
        console.error('[ai] failed to download image:', error instanceof Error ? error.message : error);
        return null;
    }
}
export function registerMessageLogger(sock, identityService, dispatcher, ai = disabledAiView()) {
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        for (const message of messages) {
            void handleMessage(message, type);
        }
    });
    async function handleMessage(message, type) {
        try {
            if (message.key.fromMe)
                return;
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
            if (!chatJid || isJidStatusBroadcast(chatJid))
                return;
            if (!identity)
                return;
            const text = extractText(message.message);
            {
                const topKeys = Object.keys(message.message ?? {});
                const resp = message.message?.interactiveResponseMessage;
                const nativeResp = resp?.nativeFlowResponseMessage;
                const dbg = [
                    `[dbg-click] messageType=${summary.kind}`,
                    `topKeys=${JSON.stringify(topKeys)}`,
                    `nativeFlow.name=${nativeResp?.name ?? '-'}`,
                    `nativeFlow.version=${nativeResp?.version ?? '-'}`,
                    `nativeFlow.paramsJson=${nativeResp?.paramsJson ?? '-'}`,
                    `extractedText=${text ?? '-'}`,
                    `upsertType=${type}`,
                    `fromMe=${message.key.fromMe}`,
                    `hasIdentity=${identity !== null}`,
                ];
                console.log(dbg.join(' | '));
            }
            if (ai.enabled && ai.activeChat(identity.userId) !== null) {
                let image = null;
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
                    reply: (replyText) => sock.sendMessage(chatJid, { text: replyText }).then(() => undefined),
                });
                if (routed === 'ai')
                    return;
            }
            if (!text || type !== 'notify') {
                console.log(`[dbg-click] DROPPED text=${text ?? '(null)'} type=${type} id=${message.key.id ?? '-'}`);
                return;
            }
            await dispatcher
                .handle(text, {
                identity,
                reply: (replyText) => sock.sendMessage(chatJid, { text: replyText }).then(() => undefined),
                sendList: async (options) => {
                    // A section is a list the user reads, not a second prompt: the
                    // image and the list travel in one caption, which every client
                    // shows and no relay node can drop.
                    if (options.plain) {
                        const caption = renderSectionList(options);
                        const imageBuffer = await loadMenuImage(options.imageKey);
                        try {
                            await sock.sendMessage(chatJid, { image: imageBuffer, caption, mimetype: 'image/png' });
                        }
                        catch (error) {
                            console.error('[menu] section list with image failed, falling back to text:', error);
                            await sock.sendMessage(chatJid, { text: caption });
                        }
                        return;
                    }
                    // A carousel with its header image is the only shape every client renders.
                    // It needs the biz/bot nodes: without them WhatsApp drops it on Android
                    // while iOS keeps showing it, which is what made this look device specific.
                    const imageBuffer = await loadMenuImage(options.imageKey);
                    let imageMessage;
                    try {
                        ({ imageMessage } = await prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer, mediaUploadTimeoutMs: 30_000 }));
                    }
                    catch (error) {
                        console.error('[menu] could not upload the header image:', error);
                    }
                    const buttonParamsJson = JSON.stringify({
                        title: options.buttonText,
                        sections: [
                            {
                                title: options.title,
                                rows: options.rows.map((row) => ({
                                    title: row.title,
                                    description: row.description,
                                    id: row.rowId,
                                })),
                            },
                        ],
                    });
                    const nativeFlow = proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                            name: 'single_select',
                            buttonParamsJson,
                        })],
                        messageParamsJson: '{}',
                        messageVersion: 1,
                    });
                    const bizNode = {
                        tag: 'biz',
                        attrs: {},
                        content: [
                            {
                                tag: 'interactive',
                                attrs: { type: 'native_flow', v: '1' },
                                content: [
                                    { tag: 'native_flow', attrs: { v: '9', name: 'mixed' } },
                                ],
                            },
                        ],
                    };
                    const botNode = { tag: 'bot', attrs: { biz_bot: '1' } };
                    const additionalNodes = isJidGroup(chatJid)
                        ? [bizNode]
                        : [bizNode, botNode];
                    const relay = async (content) => {
                        const fullMsg = generateWAMessageFromContent(chatJid, content, { userJid: sock.user?.id ?? '' });
                        await sock.relayMessage(chatJid, fullMsg.message, {
                            messageId: fullMsg.key.id,
                            additionalNodes,
                        });
                    };
                    const body = proto.Message.InteractiveMessage.Body.create({ text: options.text });
                    const footer = proto.Message.InteractiveMessage.Footer.create({ text: options.footer });
                    const card = proto.Message.InteractiveMessage.create({
                        body,
                        footer,
                        nativeFlowMessage: nativeFlow,
                    });
                    if (imageMessage) {
                        card.header = proto.Message.InteractiveMessage.Header.create({
                            title: options.title,
                            hasMediaAttachment: true,
                            imageMessage,
                        });
                    }
                    else {
                        card.header = proto.Message.InteractiveMessage.Header.create({ title: options.title });
                    }
                    try {
                        await relay({
                            interactiveMessage: {
                                carouselMessage: {
                                    cards: [card],
                                    messageVersion: 1,
                                    carouselCardType: proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType.HSCROLL_CARDS,
                                },
                                body: { text: options.text },
                                footer: { text: options.footer },
                            },
                        });
                        return;
                    }
                    catch (error) {
                        console.error('[menu] carousel failed, trying the plain native flow:', error);
                    }
                    try {
                        await relay({
                            interactiveMessage: proto.Message.InteractiveMessage.create({
                                body,
                                footer,
                                nativeFlowMessage: nativeFlow,
                            }),
                        });
                        return;
                    }
                    catch (error) {
                        console.error('[menu] native flow failed, falling back to text:', error);
                    }
                    // Never leave the user without an answer: fall back to plain text.
                    const lines = options.rows.map((row) => `• ${row.title} — ${row.rowId}`);
                    await sock.sendMessage(chatJid, { text: [options.text, ...lines].join('\n') });
                },
                sendButtons: async (options) => {
                    const buttonParamsJson = options.buttons
                        .map((button) => ({
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                            display_text: button.displayText,
                            id: button.id,
                        }),
                    }))
                        .map((button) => proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create(button));
                    const interactiveMessage = proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: options.text,
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: options.footer,
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: buttonParamsJson,
                            messageParamsJson: '{}',
                            messageVersion: 1,
                        }),
                    });
                    const fullMsg = generateWAMessageFromContent(chatJid, { interactiveMessage }, { userJid: sock.user?.id ?? '' });
                    const bizNode = {
                        tag: 'biz',
                        attrs: {},
                        content: [
                            {
                                tag: 'interactive',
                                attrs: { type: 'native_flow', v: '1' },
                                content: [
                                    { tag: 'native_flow', attrs: { v: '9', name: 'mixed' } },
                                ],
                            },
                        ],
                    };
                    const botNode = { tag: 'bot', attrs: { biz_bot: '1' } };
                    const additionalNodes = isJidGroup(chatJid)
                        ? [bizNode]
                        : [bizNode, botNode];
                    await sock.relayMessage(chatJid, fullMsg.message, {
                        messageId: fullMsg.key.id,
                        additionalNodes,
                    });
                },
                mentions: resolveMentions(identityService, message.message),
                quoted: resolveQuoted(identityService, message.message),
            });
        }
        catch (error) {
            console.error('Failed to process message:', error);
        }
    }
}
