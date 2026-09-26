function mapChat(row) {
    return {
        id: row.id,
        chatNumber: row.chat_number,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
export class AiRepository {
    stmts;
    constructor(db) {
        this.stmts = {
            nextChatNumber: db.prepare(`SELECT COALESCE(MAX(chat_number), 0) AS n FROM ai_chats WHERE user_id = ?`),
            insertChat: db.prepare(`INSERT INTO ai_chats (user_id, chat_number) VALUES (?, ?)`),
            findChat: db.prepare(`SELECT id, chat_number, created_at, updated_at
         FROM ai_chats WHERE user_id = ? AND chat_number = ?`),
            listChats: db.prepare(`SELECT id, chat_number, created_at, updated_at
         FROM ai_chats WHERE user_id = ? ORDER BY chat_number ASC`),
            deleteChat: db.prepare(`DELETE FROM ai_chats WHERE user_id = ? AND chat_number = ?`),
            insertMessage: db.prepare(`INSERT INTO ai_messages (chat_id, role, content) VALUES (?, ?, ?)`),
            listMessages: db.prepare(`SELECT id, role, content, created_at
         FROM ai_messages WHERE chat_id = ? ORDER BY id ASC`),
            countMessages: db.prepare(`SELECT COUNT(*) AS n FROM ai_messages WHERE chat_id = ?`),
            chatById: db.prepare(`SELECT id, chat_number, created_at, updated_at FROM ai_chats WHERE id = ?`),
        };
    }
    /** Creates a chat for the user and returns its per-user progressive number. */
    createChat(userId) {
        const current = this.stmts.nextChatNumber.get(userId);
        const chatNumber = (current?.n ?? 0) + 1;
        this.stmts.insertChat.run(userId, chatNumber);
        return chatNumber;
    }
    findChat(userId, chatNumber) {
        const row = this.stmts.findChat.get(userId, chatNumber);
        return row ? mapChat(row) : undefined;
    }
    listChats(userId) {
        const rows = this.stmts.listChats.all(userId);
        return rows.map(mapChat);
    }
    deleteChat(userId, chatNumber) {
        const result = this.stmts.deleteChat.run(userId, chatNumber);
        return result.changes > 0;
    }
    addMessage(chatId, role, content) {
        this.stmts.insertMessage.run(chatId, role, content);
    }
    listMessages(chatId) {
        const rows = this.stmts.listMessages.all(chatId);
        return rows.map((row) => ({
            id: row.id,
            role: row.role,
            content: row.content,
            createdAt: row.createdAt,
        }));
    }
    countMessages(chatId) {
        const row = this.stmts.countMessages.get(chatId);
        return row?.n ?? 0;
    }
    getChatById(id) {
        const row = this.stmts.chatById.get(id);
        return row ? mapChat(row) : undefined;
    }
}
