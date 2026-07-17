import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  collectCharacterLookupKeys,
  createEmptyCharacterRegistryFile,
  type CharacterBindingResolver,
  type CharacterRecord,
  type CharacterRegistryFile,
  isCharacterRegistryFile,
  normalizeCharacterLookupKey,
  resolveCharacterBindingsForNames as resolveCharacterBindingsForNamesBase,
} from '../../types/character-registry';

export function resolveCharacterRegistryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'characters.json');
}

export class CharacterRegistryService {
  private static readonly writeChains = new Map<string, Promise<void>>();

  constructor(private readonly filePath: string) {}

  async load(): Promise<CharacterRegistryFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return isCharacterRegistryFile(parsed) ? parsed : createEmptyCharacterRegistryFile();
    } catch {
      return createEmptyCharacterRegistryFile();
    }
  }

  async save(registry: CharacterRegistryFile): Promise<void> {
    await CharacterRegistryService.withFileLock(this.filePath, async () => {
      await this.saveUnlocked(registry);
    });
  }

  private async saveUnlocked(registry: CharacterRegistryFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const json = JSON.stringify(registry, null, 2);
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, json, 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  async list(): Promise<readonly CharacterRecord[]> {
    return (await this.load()).characters;
  }

  async getById(id: string): Promise<CharacterRecord | undefined> {
    return (await this.load()).characters.find((record) => record.id === id);
  }

  async resolveByName(name: string): Promise<CharacterRecord | undefined> {
    const key = normalizeCharacterLookupKey(name);
    if (!key) {
      return undefined;
    }

    const registry = await this.load();
    return registry.characters.find((record) => collectCharacterLookupKeys(record).includes(key));
  }

  async resolveIds(names: readonly string[]): Promise<Record<string, string>> {
    if (names.length === 0) {
      return {};
    }

    const registry = await this.load();
    const lookup = new Map<string, string>();

    for (const record of registry.characters) {
      for (const key of collectCharacterLookupKeys(record)) {
        if (!lookup.has(key)) {
          lookup.set(key, record.id);
        }
      }
    }

    const resolved: Record<string, string> = {};
    for (const name of names) {
      const key = normalizeCharacterLookupKey(name);
      if (!key) {
        continue;
      }
      const characterId = lookup.get(key);
      if (characterId) {
        resolved[name] = characterId;
      }
    }

    return resolved;
  }

  async upsert(record: CharacterRecord): Promise<CharacterRegistryFile> {
    return this.mutate(async (registry) => {
      const nextCharacters = registry.characters.filter((candidate) => candidate.id !== record.id);
      nextCharacters.push(record);

      return {
        version: 1,
        characters: nextCharacters,
      };
    });
  }

  async remove(id: string): Promise<CharacterRegistryFile> {
    return this.mutate(async (registry) => ({
      version: 1,
      characters: registry.characters.filter((record) => record.id !== id),
    }));
  }

  private async mutate(
    operation: (
      registry: CharacterRegistryFile,
    ) => Promise<CharacterRegistryFile> | CharacterRegistryFile,
  ): Promise<CharacterRegistryFile> {
    return CharacterRegistryService.withFileLock(this.filePath, async () => {
      const registry = await this.load();
      const nextRegistry = await operation(registry);
      await this.saveUnlocked(nextRegistry);
      return nextRegistry;
    });
  }

  private static async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous = CharacterRegistryService.writeChains.get(filePath) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const nextChain = previous.catch(() => {}).then(() => gate);
    CharacterRegistryService.writeChains.set(filePath, nextChain);

    await previous.catch(() => {});

    try {
      return await operation();
    } finally {
      release?.();
      const current = CharacterRegistryService.writeChains.get(filePath);
      if (current === nextChain) {
        CharacterRegistryService.writeChains.delete(filePath);
      }
    }
  }
}

export async function loadCharacterBindingsForNames(
  workspaceRoot: string | undefined,
  names: readonly string[],
): Promise<Record<string, string>> {
  if (!workspaceRoot || names.length === 0) {
    return {};
  }

  const service = new CharacterRegistryService(resolveCharacterRegistryPath(workspaceRoot));
  return service.resolveIds(names);
}

export async function resolveCharacterBindingsForNames(
  names: readonly string[],
  options: {
    workspaceRoot?: string;
    uriOrPath?: string;
    characterResolver?: CharacterBindingResolver;
  } = {},
): Promise<Record<string, string>> {
  const workspaceRoot = options.workspaceRoot;
  return resolveCharacterBindingsForNamesBase(names, {
    uriOrPath: options.uriOrPath,
    characterResolver: options.characterResolver,
    fallbackLoader: workspaceRoot
      ? (unresolvedNames) => loadCharacterBindingsForNames(workspaceRoot, unresolvedNames)
      : undefined,
  });
}
