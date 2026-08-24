import { watch, type FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CommandRegistry } from './registry.js';
import type { Command } from './types.js';

const LOG_PREFIX = '[commands]';
const DEBOUNCE_MS = 150;
const INFRA_BASENAMES = new Set(['types', 'registry', 'loader', 'dispatcher']);
const IGNORED_PREFIXES = ['.', '#', '~'];
const IGNORED_SUFFIXES = ['.tmp', '.swp', '.bak'];

interface LoadedCommandEntry {
  name: string;
  command: Command;
}

export interface CommandLoaderOptions {
  commandsDir?: string;
  extension?: string;
}

export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Command>;
  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) return false;
  if (typeof candidate.execute !== 'function') return false;
  if (
    candidate.aliases !== undefined &&
    !(Array.isArray(candidate.aliases) && candidate.aliases.every((a) => typeof a === 'string'))
  ) {
    return false;
  }
  if (candidate.category !== undefined && typeof candidate.category !== 'string') return false;
  return true;
}

function resolveTargetDirectory(): { dir: string; extension: string } {
  const hereDir = path.dirname(fileURLToPath(import.meta.url));
  const unified = hereDir.split(path.sep).join('/');
  const runningFromSource = unified.includes('/src/');
  const projectRoot = path.resolve(hereDir, '..', '..');
  return {
    dir: runningFromSource
      ? path.join(projectRoot, 'src', 'commands')
      : path.join(projectRoot, 'dist', 'commands'),
    extension: runningFromSource ? '.ts' : '.js',
  };
}

function isRelevantFile(fileName: string, extension: string): boolean {
  if (!fileName.endsWith(extension)) return false;
  if (extension === '.ts' && fileName.endsWith('.d.ts')) return false;
  const base = fileName.slice(0, -extension.length);
  if (INFRA_BASENAMES.has(base)) return false;
  const lower = fileName.toLowerCase();
  if (IGNORED_PREFIXES.some((prefix) => fileName.startsWith(prefix))) return false;
  if (IGNORED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return false;
  if (fileName.endsWith('~')) return false;
  return true;
}

export class CommandLoader {
  private readonly registry: CommandRegistry;
  private readonly baseDir: string;
  private readonly extension: string;
  private readonly loadedFiles = new Map<string, LoadedCommandEntry>();
  private readonly pendingRefreshes = new Map<string, NodeJS.Timeout>();
  private importCounter = 0;
  private watcher: FSWatcher | undefined;

  constructor(registry: CommandRegistry, options: CommandLoaderOptions = {}) {
    this.registry = registry;
    const resolved = resolveTargetDirectory();
    this.baseDir = path.resolve(options.commandsDir ?? resolved.dir);
    this.extension = options.extension ?? resolved.extension;
  }

  async start(): Promise<void> {
    await this.loadAll();
    this.startWatcher();
  }

  stop(): void {
    for (const timer of this.pendingRefreshes.values()) clearTimeout(timer);
    this.pendingRefreshes.clear();
    this.watcher?.close();
    this.watcher = undefined;
  }

  async loadFile(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    const moduleUrl = pathToFileURL(absPath);
    this.importCounter += 1;
    moduleUrl.searchParams.set('v', String(this.importCounter));

    const module = await import(moduleUrl.href);
    const candidate: unknown = (module as { default?: unknown }).default;
    if (!isCommand(candidate)) {
      throw new Error(`does not default-export a valid Command`);
    }

    const previous = this.loadedFiles.get(absPath);
    const nextKey = candidate.name.toLowerCase();

    if (previous && previous.name !== nextKey && this.registry.get(nextKey)) {
      console.error(
        `${LOG_PREFIX} cannot rename "${previous.command.name}" to "${candidate.name}" ` +
          `(${path.basename(absPath)}): identifier already owned by another command`,
      );
      return;
    }

    if (previous) this.registry.unregister(previous.name);

    const registration = this.registry.register(candidate);
    if (!registration.ok) {
      console.error(
        `${LOG_PREFIX} failed to register "${candidate.name}" (${path.basename(absPath)}): ${registration.error}`,
      );
      if (previous) {
        const restored = this.registry.register(previous.command);
        if (restored.ok) {
          console.error(`${LOG_PREFIX} kept previous working version of "${previous.command.name}"`);
        } else {
          console.error(
            `${LOG_PREFIX} rollback failed for "${previous.command.name}": ${restored.error}`,
          );
        }
      }
      return;
    }

    this.loadedFiles.set(absPath, { name: nextKey, command: candidate });
    console.log(`${LOG_PREFIX} ${previous ? 'reloaded' : 'loaded'}: ${candidate.name}`);
  }

  unloadFile(filePath: string): void {
    const absPath = path.resolve(filePath);
    const previous = this.loadedFiles.get(absPath);
    if (!previous) return;
    this.loadedFiles.delete(absPath);
    if (this.registry.unregister(previous.name)) {
      console.log(`${LOG_PREFIX} unloaded: ${previous.command.name}`);
    }
  }

  private async loadAll(): Promise<void> {
    const dirents = await readdir(this.baseDir, { withFileTypes: true, recursive: true });
    const files = dirents
      .filter((dirent) => dirent.isFile())
      .map((dirent) => path.join(dirent.parentPath, dirent.name))
      .filter((file) => isRelevantFile(path.basename(file), this.extension));
    for (const file of files) {
      try {
        await this.loadFile(file);
      } catch (error) {
        console.error(
          `${LOG_PREFIX} failed to load ${path.basename(file)}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  private startWatcher(): void {
    if (this.watcher) return;
    this.watcher = watch(this.baseDir, { recursive: true }, (_eventType, rawFileName) => {
      this.scheduleRefresh(rawFileName);
    });
    this.watcher.on('error', (error) => {
      console.error(`${LOG_PREFIX} watcher error:`, error);
    });
    console.log(`${LOG_PREFIX} watching: ${this.baseDir}`);
  }

  private scheduleRefresh(rawFileName: string | Buffer | null): void {
    if (rawFileName === null) return;
    const relative = typeof rawFileName === 'string' ? rawFileName : rawFileName.toString('utf8');
    const absPath = path.resolve(this.baseDir, relative);
    const existingTimer = this.pendingRefreshes.get(absPath);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      this.pendingRefreshes.delete(absPath);
      void this.refresh(absPath);
    }, DEBOUNCE_MS);
    timer.unref();
    this.pendingRefreshes.set(absPath, timer);
  }

  private async refresh(absPath: string): Promise<void> {
    try {
      if (!isRelevantFile(path.basename(absPath), this.extension)) return;
      const info = await stat(absPath).catch(() => undefined);
      if (!info) {
        this.unloadFile(absPath);
      } else if (info.isFile()) {
        await this.loadFile(absPath);
      }
    } catch (error) {
      console.error(
        `${LOG_PREFIX} error while refreshing ${path.basename(absPath)}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
