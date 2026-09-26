import { fileURLToPath } from 'node:url';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
const AUTH_FOLDER = fileURLToPath(new URL('../../auth', import.meta.url));
export async function createAuthState() {
    return useMultiFileAuthState(AUTH_FOLDER);
}
