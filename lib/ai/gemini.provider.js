const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT_MS = 60_000;
/** Thrown for any Gemini request failure (HTTP error, timeout, network issue). */
export class GeminiRequestError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GeminiRequestError';
    }
}
export class GeminiProvider {
    apiKey;
    model;
    timeoutMs;
    constructor(options) {
        if (!options.apiKey || options.apiKey.trim().length === 0) {
            throw new Error('GeminiProvider requires a non-empty apiKey');
        }
        if (!options.model || options.model.trim().length === 0) {
            throw new Error('GeminiProvider requires a non-empty model');
        }
        this.apiKey = options.apiKey;
        this.model = options.model;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }
    async generateResponse(messages) {
        const modelPath = `/models/${encodeURIComponent(this.model)}:generateContent`;
        const url = `${GEMINI_API_BASE}${modelPath}?key=${encodeURIComponent(this.apiKey)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: messages.map((message) => {
                        const parts = [];
                        if (message.image) {
                            const bytes = message.image.data instanceof ArrayBuffer
                                ? new Uint8Array(message.image.data)
                                : message.image.data;
                            parts.push({
                                inlineData: {
                                    mimeType: message.image.mimeType,
                                    data: Buffer.from(bytes).toString('base64'),
                                },
                            });
                        }
                        if (message.text && message.text.length > 0) {
                            parts.push({ text: message.text });
                        }
                        return { role: message.role, parts };
                    }),
                }),
            });
            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                console.error(`[ai][gemini] request failed: model=${this.model} ` +
                    `url=${GEMINI_API_BASE}${modelPath} method=POST ` +
                    `status=${response.status} statusText=${response.statusText} ` +
                    `body=${errorBody}`);
                throw new GeminiRequestError(`Gemini API returned HTTP ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
            }
            const data = (await response.json());
            const text = data.candidates?.[0]?.content?.parts
                ?.map((part) => part.text ?? '')
                .join('')
                .trim();
            return text ?? '';
        }
        catch (error) {
            if (error instanceof GeminiRequestError)
                throw error;
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new GeminiRequestError('Gemini request timed out');
            }
            throw new GeminiRequestError('Gemini request failed');
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
/**
 * Builds a GeminiProvider from environment variables, or null when the API key
 * is missing so the bot can keep running with AI disabled.
 */
export function createGeminiProviderFromEnv() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
        return null;
    }
    const configuredModel = process.env.GEMINI_MODEL;
    const model = configuredModel && configuredModel.trim().length > 0
        ? configuredModel.trim()
        : DEFAULT_GEMINI_MODEL;
    return new GeminiProvider({ apiKey, model });
}
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
