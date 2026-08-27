import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { resolveAuthRoot } from '../config/paths.js';

export async function createAuthState() {
  return useMultiFileAuthState(resolveAuthRoot());
}
