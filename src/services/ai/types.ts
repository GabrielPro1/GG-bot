export type MessageRole = 'user' | 'assistant';

/** Role as expected by the Gemini contents API ('model' == assistant). */
export type AiRequestRole = 'user' | 'model';

/** Raw image bytes to send to a provider (in-memory only, never persisted). */
export interface AiImageInput {
  readonly mimeType: string;
  readonly data: Uint8Array | ArrayBuffer;
}

export interface AiRequestMessage {
  readonly role: AiRequestRole;
  readonly text: string;
  /** Optional in-memory image attached to this message (not persisted). */
  readonly image?: AiImageInput;
}

export interface AiChatSummary {
  readonly chatNumber: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount: number;
}

export type AiErrorCode =
  | 'disabled'
  | 'invalid_id'
  | 'empty_message'
  | 'not_found'
  | 'provider_error'
  | 'empty_response'
  | 'db_error';

export type CreateChatResult =
  | { ok: true; chatNumber: number }
  | { ok: false; error: 'disabled' | 'db_error' };

export type ListChatsResult =
  | { ok: true; chats: AiChatSummary[] }
  | { ok: false; error: 'disabled' | 'db_error' };

export type DeleteChatResult =
  | { ok: true; chatNumber: number }
  | { ok: false; error: 'not_found' | 'disabled' | 'invalid_id' | 'db_error' };

export type SendMessageResult =
  | { ok: true; chatNumber: number; reply: string }
  | { ok: false; error: AiErrorCode };

export const AI_IMAGE_MARKER = '[Immagine]';

/** Text used as chat content marker in the DB for image-only messages. */
export interface AIServiceView {
  readonly enabled: boolean;
  createChat(userId: string): CreateChatResult;
  listChats(userId: string): ListChatsResult;
  deleteChat(userId: string, chatNumber: number): DeleteChatResult;
  sendMessage(
    userId: string,
    chatNumber: number,
    text: string,
    image?: AiImageInput,
  ): Promise<SendMessageResult>;
  /** Returns the per-user progressive chat number that is active, or null. */
  activeChat(userId: string): number | null;
  /** Deactivates AI mode for a user (keeps the chat and history). */
  deactivate(userId: string): void;
}
