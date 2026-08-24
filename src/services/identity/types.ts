export interface WaUserIdentity {
  userId: string;
  lid: string | null;
  pn: string | null;
  username: string | null;
}

export interface LidPnResolver {
  getLIDForPN(pn: string): Promise<string | null>;
  getPNForLID(lid: string): Promise<string | null>;
}

export interface IdentityServiceOptions {
  generateUserId?: () => string;
  lidPnResolver?: LidPnResolver;
}
