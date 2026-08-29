import type { AiRequestMessage } from './types.js';

/**
 * Abstract provider for text generation. Implementations must not leak
 * provider-specific details (SDK objects, API keys, stack traces) to callers.
 */
export interface AiProvider {
  generateResponse(messages: readonly AiRequestMessage[]): Promise<string>;
}
