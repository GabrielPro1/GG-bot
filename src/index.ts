import { connectWhatsApp } from './whatsapp/connection.js';
import { IdentityService } from './services/identity/identity.service.js';

console.log('GG Bot starting...');

const identityService = new IdentityService();

try {
  await connectWhatsApp(identityService);
} catch (error) {
  console.error('Failed to start GG Bot:', error);
  process.exitCode = 1;
}
