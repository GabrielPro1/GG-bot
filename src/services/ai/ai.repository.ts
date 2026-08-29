import type Database from 'better-sqlite3';
import type { MessageRole } from './types.js';

export interface AiChatRow {
  id: number;
  chatNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageRow {
  id: number;
  role: MessageRole;
  content: string;
  createdAt: string;
}

interface ChatRow {
  id: number;
  chat_number: number;
  created_at: string;
  updated_at: string;
}

function mapChat(row: ChatRow): AiChatRow {
  return {
    id: row.id,
    chatNumber: row.chat_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AiRepository {
  private readonly stmts: {
    nextChatNumber: Database.Statement;
    insertChat: Database.Statement;
    findChat: Database.Statement;
    listChats: Database.Statement;
    deleteChat: Database.Statement;
    insertMessage: Database.Statement;
    listMessages: Database.Statement;
    countMessages: Database.Statement;
    chatById: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.stmts = {
      nextChatNumber: db.prepare(
        `SELECT COALESCE(MAX(chat_number), 0) AS n FROM ai_chats WHERE user_id = ?`,
      ),
      insertChat: db.prepare(
        `INSERT INTO ai_chats (user_id, chat_number) VALUES (?, ?)`,
      ),
      findChat: db.prepare(
        `SELECT id, chat_number, created_at, updated_at
         FROM ai_chats WHERE user_id = ? AND chat_number = ?`,
      ),
      listChats: db.prepare(
        `SELECT id, chat_number, created_at, updated_at
         FROM ai_chats WHERE user_id = ? ORDER BY chat_number ASC`,
      ),
      deleteChat: db.prepare(
        `DELETE FROM ai_chats WHERE user_id = ? AND chat_number = ?`,
      ),
      insertMessage: db.prepare(
        `INSERT INTO ai_messages (chat_id, role, content) VALUES (?, ?, ?)`,
      ),
      listMessages: db.prepare(
        `SELECT id, role, content, created_at
         FROM ai_messages WHERE chat_id = ? ORDER BY id ASC`,
      ),
      countMessages: db.prepare(
        `SELECT COUNT(*) AS n FROM ai_messages WHERE chat_id = ?`,
      ),
      chatById: db.prepare(
        `SELECT id, chat_number, created_at, updated_at FROM ai_chats WHERE id = ?`,
      ),
    };
  }

  /** Creates a chat for the user and returns its per-user progressive number. */
  createChat(userId: string): number {
    const current = this.stmts.nextChatNumber.get(userId) as { n: number };
    const chatNumber = (current?.n ?? 0) + 1;
    this.stmts.insertChat.run(userId, chatNumber);
    return chatNumber;
  }

  findChat(userId: string, chatNumber: number): AiChatRow | undefined {
    const row = this.stmts.findChat.get(userId, chatNumber) as ChatRow | undefined;
    return row ? mapChat(row) : undefined;
  }

  listChats(userId: string): AiChatRow[] {
    const rows = this.stmts.listChats.all(userId) as ChatRow[];
    return rows.map(mapChat);
  }

  deleteChat(userId: string, chatNumber: number): boolean {
    const result = this.stmts.deleteChat.run(userId, chatNumber);
    return result.changes > 0;
  }

  addMessage(chatId: number, role: MessageRole, content: string): void {
    this.stmts.insertMessage.run(chatId, role, content);
  }

  listMessages(chatId: number): AiMessageRow[] {
    const rows = this.stmts.listMessages.all(chatId) as AiMessageRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt,
    }));
  }

  countMessages(chatId: number): number {
    const row = this.stmts.countMessages.get(chatId) as { n: number };
    return row?.n ?? 0;
  }

  getChatById(id: number): AiChatRow | undefined {
    const row = this.stmts.chatById.get(id) as ChatRow | undefined;
    return row ? mapChat(row) : undefined;
  }
}
