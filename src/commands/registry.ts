import type { Command } from './types.js';

export interface RegistrationResult {
  ok: boolean;
  error?: string;
}

function keyOf(value: string): string {
  return value.trim().toLowerCase();
}

export class CommandRegistry {
  private readonly commandsByName = new Map<string, Command>();
  private readonly canonicalByKey = new Map<string, string>();
  private readonly aliases: Readonly<Record<string, readonly string[]>>;

  constructor(aliases: Readonly<Record<string, readonly string[]>> = {}) {
    this.aliases = aliases;
  }

  register(command: Command): RegistrationResult {
    const nameKey = keyOf(command.name);
    if (nameKey.length === 0) {
      return { ok: false, error: 'command name is empty' };
    }
    const inlineAliases = command.aliases ?? [];
    const externalAliases = this.aliases[nameKey] ?? [];
    const aliasKeys = [...inlineAliases, ...externalAliases]
      .map((alias) => keyOf(alias))
      .filter((key) => key.length > 0);
    const uniqueAliasKeys = [...new Set(aliasKeys)];
    const requestedKeys = [nameKey, ...uniqueAliasKeys];
    const conflicts = requestedKeys.filter((key) => this.canonicalByKey.has(key));
    if (conflicts.length > 0) {
      return {
        ok: false,
        error: `identifier(s) already in use by another command: ${conflicts
          .map((key) => `"${key}"`)
          .join(', ')}`,
      };
    }
    this.commandsByName.set(nameKey, command);
    for (const key of requestedKeys) {
      this.canonicalByKey.set(key, nameKey);
    }
    return { ok: true };
  }

  unregister(name: string): boolean {
    const nameKey = keyOf(name);
    const command = this.commandsByName.get(nameKey);
    if (!command) return false;
    this.commandsByName.delete(nameKey);
    for (const [key, canonical] of this.canonicalByKey) {
      if (canonical === nameKey) this.canonicalByKey.delete(key);
    }
    return true;
  }

  get(name: string): Command | null {
    const canonical = this.canonicalByKey.get(keyOf(name));
    if (!canonical) return null;
    return this.commandsByName.get(canonical) ?? null;
  }

  has(name: string): boolean {
    return this.get(name) !== null;
  }

  getAll(): Command[] {
    return [...this.commandsByName.values()];
  }
}
