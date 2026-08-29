import type { AiImageInput, AIServiceView } from './types.js';

export const AI_COMMAND_PREFIX = '/';

const AI_ERRORS: Record<string, string> = {
  disabled: '⚠️ Il servizio AI non è configurato.',
  not_found: '❌ Chat AI non trovata.',
  provider_error: '⚠️ Si è verificato un errore durante la richiesta all\'AI. Riprova tra poco.',
  empty_response: '⚠️ L\'AI non ha restituito una risposta. Riprova.',
  empty_message: '⚠️ Messaggio vuoto.',
  invalid_id: '❌ Chat AI non valida.',
  db_error: '❌ Errore nel database. Riprova.',
};

export interface AiModeImage {
  readonly mimeType: string;
  readonly data: Uint8Array | ArrayBuffer;
}

export interface AiModeDispatchInput {
  ai: AIServiceView;
  userId: string;
  /** Raw extracted text (null when the message has no text). */
  text: string | null;
  /** In-memory image payload to attach (null when the message has no image). */
  image: AiModeImage | null;
  reply: (text: string) => Promise<void>;
}

export type AiModeDispatchResult = 'ai' | 'command' | 'none';

/**
 * Routes an incoming user message when AI mode is active for that user.
 *
 * Returns:
 *  - 'command'  → the message is a command (/...): it must go through the
 *                 normal dispatcher (handles /esci chat, /ping, /menu, ...).
 *  - 'ai'       → the message was sent to the AI and its reply already sent.
 *  - 'none'     → AI mode is not active or the message is not AI-addressable.
 *
 * This function is Pure (no Baileys dependency) so it can be unit-tested and
 * reused by the WhatsApp event handler.
 */
export async function handleAiModeMessage(
  input: AiModeDispatchInput,
): Promise<AiModeDispatchResult> {
  const { ai, userId, text, image, reply } = input;
  if (!ai.enabled) return 'none';

  const chatNumber = ai.activeChat(userId);
  if (chatNumber === null) return 'none';

  const isCommand = text !== null && text.startsWith(AI_COMMAND_PREFIX);
  if (isCommand) return 'command';

  const hasText = text !== null && text.trim().length > 0;
  const hasImage = image !== null;
  if (!hasText && !hasImage) return 'none';

  const aiImage: AiImageInput | undefined = hasImage
    ? { mimeType: image!.mimeType, data: image!.data }
    : undefined;

  const result = await ai.sendMessage(userId, chatNumber, text ?? '', aiImage);
  if (!result.ok) {
    await reply(AI_ERRORS[result.error] ?? AI_ERRORS.provider_error);
    return 'ai';
  }
  await reply(result.reply);
  return 'ai';
}
