function normalizeIdentifier(raw) {
    return raw.trim().toLowerCase();
}
export class OwnerService {
    owners;
    constructor(options = {}) {
        this.owners = new Set((options.owners ?? [])
            .map(normalizeIdentifier)
            .filter((value) => value.length > 0));
    }
    isOwner(identity) {
        if (!identity)
            return false;
        if (identity.lid && this.owners.has(normalizeIdentifier(identity.lid))) {
            return true;
        }
        if (identity.pn && this.owners.has(normalizeIdentifier(identity.pn))) {
            return true;
        }
        return false;
    }
}
export function loadOwnerServiceFromEnv() {
    const raw = process.env.BOT_OWNERS ?? process.env.OWNERS ?? '';
    const owners = raw.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
    return new OwnerService({ owners });
}
