import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function projectAuthFolder(): string {
  return resolve(PROJECT_ROOT, 'auth');
}

/** Root that holds the main session files and the per-user Telegram session folders. */
export function resolveAuthRoot(): string {
  const fromEnv = process.env.WHATSAPP_AUTH_ROOT;
  if (fromEnv && fromEnv.trim().length > 0) {
    return resolve(fromEnv);
  }
  return projectAuthFolder();
}
