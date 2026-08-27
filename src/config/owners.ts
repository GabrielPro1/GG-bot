import type { WaUserIdentity } from '../services/identity/types.js';

export interface OwnerServiceOptions {
  owners?: readonly string[];
}

function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

export class OwnerService {
  private readonly owners: ReadonlySet<string>;

  constructor(options: OwnerServiceOptions = {}) {
    this.owners = new Set(
      (options.owners ?? [])
        .map(normalizeIdentifier)
        .filter((value) => value.length > 0),
    );
  }

  isOwner(identity: WaUserIdentity | null | undefined): boolean {
    if (!identity) return false;
    if (identity.lid && this.owners.has(normalizeIdentifier(identity.lid))) {
      return true;
    }
    if (identity.pn && this.owners.has(normalizeIdentifier(identity.pn))) {
      return true;
    }
    return false;
  }
}

export function loadOwnerServiceFromEnv(): OwnerService {
  const raw = process.env.BOT_OWNERS ?? process.env.OWNERS ?? '';
  const owners = raw.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
  return new OwnerService({ owners });
}
