import type {
  CharacterRecord,
  CharacterRegistryFile,
  CreativeEntity,
  CreativeEntityKind,
  CreativeEntityQuery,
  ProjectCreativeEntityFile,
} from '@neko/shared';
import {
  collectCharacterLookupKeys,
  createEmptyCharacterRegistryFile,
  isCharacterRegistryFile,
  isCreativeEntity,
  isProjectCreativeEntityFile,
  normalizeCharacterLookupKey,
} from '@neko/shared';
import type { EntityRuntimePorts } from './ports';
import { SerialEntityRuntimeLock } from './ports';
import {
  buildEntityId,
  characterRecordToCreativeEntity,
  collectCreativeEntityLookupKeys,
  creativeEntityToCharacterRecord,
  matchesCreativeEntityQuery,
  normalizeAliasList,
} from './adapters';
import {
  assertGitTrackedEntityFactPath,
  resolveCharacterRegistryPath,
  resolveProjectEntityFilePath,
} from './paths';

const NON_CHARACTER_KINDS: readonly Exclude<CreativeEntityKind, 'character'>[] = [
  'scene',
  'location',
  'object',
  'style',
] as const;

export interface EntityStoreOptions {
  readonly projectRoot: string;
  readonly ports: EntityRuntimePorts;
}

export class ProjectEntityStore {
  private readonly lock;

  constructor(private readonly options: EntityStoreOptions) {
    this.lock = options.ports.lock ?? new SerialEntityRuntimeLock();
  }

  get projectRoot(): string {
    return this.options.projectRoot;
  }

  async list(query: CreativeEntityQuery = {}): Promise<readonly CreativeEntity[]> {
    const files = await Promise.all([
      this.loadCharacters(),
      ...NON_CHARACTER_KINDS.map((kind) => this.loadProjectEntityFile(kind)),
    ]);
    return files
      .flatMap((file) =>
        'characters' in file ? file.characters.map(characterRecordToCreativeEntity) : file.entities,
      )
      .filter((entity) => matchesCreativeEntityQuery(entity, query))
      .sort(compareEntities);
  }

  async get(id: string): Promise<CreativeEntity | undefined> {
    const all = await this.list();
    return all.find((entity) => entity.id === id);
  }

  async resolveByName(
    name: string,
    kind?: CreativeEntityKind,
  ): Promise<CreativeEntity | undefined> {
    const record = await this.resolveCharacterRecordByName(name);
    if (record && (kind === undefined || kind === 'character')) {
      return characterRecordToCreativeEntity(record);
    }
    if (kind === 'character') {
      return undefined;
    }

    const key = normalizeCharacterLookupKey(name);
    if (!key) return undefined;
    const entities = await this.list(kind ? { kind } : {});
    return entities.find((entity) => collectCreativeEntityLookupKeys(entity).includes(key));
  }

  async resolveCharacterRecordByName(name: string): Promise<CharacterRecord | undefined> {
    const key = normalizeCharacterLookupKey(name);
    if (!key) return undefined;
    const registry = await this.loadCharacters();
    return registry.characters.find((candidate) =>
      collectCharacterLookupKeys(candidate).includes(key),
    );
  }

  async upsert(entity: CreativeEntity): Promise<CreativeEntity> {
    if (!isCreativeEntity(entity)) {
      throw new Error('Invalid creative entity.');
    }
    if (entity.kind === 'character') {
      await this.upsertCharacterEntity(entity);
      return entity;
    }
    if (!isNonCharacterEntity(entity)) {
      throw new Error('Invalid non-character creative entity.');
    }
    await this.upsertProjectEntity(entity);
    return entity;
  }

  async create(input: {
    readonly kind: CreativeEntityKind;
    readonly canonicalName: string;
    readonly displayName?: string;
    readonly aliases?: readonly string[];
    readonly status?: CreativeEntity['status'];
    readonly metadata?: Record<string, unknown>;
    readonly id?: string;
  }): Promise<CreativeEntity> {
    const entity: CreativeEntity = {
      id: input.id ?? buildEntityId(input.kind, input.canonicalName),
      kind: input.kind,
      canonicalName: input.canonicalName,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      aliases: normalizeAliasList(input.aliases ?? []),
      status: input.status ?? 'confirmed',
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    return this.upsert(entity);
  }

  async remove(id: string): Promise<CreativeEntity | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;

    if (current.kind === 'character') {
      const filePath = resolveCharacterRegistryPath(this.options.projectRoot);
      await this.lock.withLock(filePath, async () => {
        const file = await this.loadCharacters();
        await this.write(filePath, {
          version: 1,
          characters: file.characters.filter((record) => record.id !== id),
        } satisfies CharacterRegistryFile);
      });
      return current;
    }

    if (!isNonCharacterEntity(current)) {
      throw new Error('Invalid non-character creative entity.');
    }

    const filePath = resolveProjectEntityFilePath(this.options.projectRoot, current.kind);
    await this.lock.withLock(filePath, async () => {
      const file = await this.loadProjectEntityFile(current.kind);
      await this.write(filePath, {
        version: 1,
        kind: current.kind,
        entities: file.entities.filter((entity) => entity.id !== id),
      } satisfies ProjectCreativeEntityFile);
    });
    return current;
  }

  async loadCharacters(): Promise<CharacterRegistryFile> {
    const filePath = resolveCharacterRegistryPath(this.options.projectRoot);
    assertGitTrackedEntityFactPath(filePath);
    const parsed = await this.options.ports.files.readJson(filePath);
    if (isCharacterRegistryFile(parsed)) {
      return parsed;
    }
    if (parsed !== undefined) {
      this.options.ports.logger?.warn('Ignoring malformed characters.json', { filePath });
    }
    return createEmptyCharacterRegistryFile();
  }

  async loadProjectEntityFile(
    kind: Exclude<CreativeEntityKind, 'character'>,
  ): Promise<ProjectCreativeEntityFile> {
    const filePath = resolveProjectEntityFilePath(this.options.projectRoot, kind);
    assertGitTrackedEntityFactPath(filePath);
    const parsed = await this.options.ports.files.readJson(filePath);
    if (isProjectCreativeEntityFile(parsed) && parsed.kind === kind) {
      return parsed;
    }
    if (parsed !== undefined) {
      this.options.ports.logger?.warn('Ignoring malformed creative entity file', {
        filePath,
        kind,
      });
    }
    return createEmptyProjectCreativeEntityFile(kind);
  }

  private async upsertCharacterEntity(entity: CreativeEntity): Promise<void> {
    const filePath = resolveCharacterRegistryPath(this.options.projectRoot);
    assertGitTrackedEntityFactPath(filePath);
    await this.lock.withLock(filePath, async () => {
      const file = await this.loadCharacters();
      const existing = file.characters.find((record) => record.id === entity.id);
      const record = creativeEntityToCharacterRecord(entity, existing);
      await this.write(filePath, {
        version: 1,
        characters: [
          ...file.characters.filter((candidate) => candidate.id !== record.id),
          record,
        ].sort(compareCharacterRecords),
      } satisfies CharacterRegistryFile);
    });
  }

  private async upsertProjectEntity(
    entity: CreativeEntity & { readonly kind: Exclude<CreativeEntityKind, 'character'> },
  ): Promise<void> {
    const filePath = resolveProjectEntityFilePath(this.options.projectRoot, entity.kind);
    assertGitTrackedEntityFactPath(filePath);
    await this.lock.withLock(filePath, async () => {
      const file = await this.loadProjectEntityFile(entity.kind);
      await this.write(filePath, {
        version: 1,
        kind: entity.kind,
        entities: [...file.entities.filter((candidate) => candidate.id !== entity.id), entity].sort(
          compareEntities,
        ),
      } satisfies ProjectCreativeEntityFile);
    });
  }

  private async write(
    filePath: string,
    value: CharacterRegistryFile | ProjectCreativeEntityFile,
  ): Promise<void> {
    await this.options.ports.files.writeJson(filePath, value);
  }
}

export class CreativeEntityRegistryService {
  constructor(private readonly store: ProjectEntityStore) {}

  async list(query: CreativeEntityQuery = {}): Promise<readonly CreativeEntity[]> {
    return this.store.list(query);
  }

  async get(id: string): Promise<CreativeEntity | undefined> {
    return this.store.get(id);
  }

  async resolveByName(
    name: string,
    kind?: CreativeEntityKind,
  ): Promise<CreativeEntity | undefined> {
    return this.store.resolveByName(name, kind);
  }
}

export function createEmptyProjectCreativeEntityFile(
  kind: Exclude<CreativeEntityKind, 'character'>,
): ProjectCreativeEntityFile {
  return {
    version: 1,
    kind,
    entities: [],
  };
}

function compareEntities(a: CreativeEntity, b: CreativeEntity): number {
  return (
    a.kind.localeCompare(b.kind) ||
    a.canonicalName.localeCompare(b.canonicalName) ||
    a.id.localeCompare(b.id)
  );
}

function compareCharacterRecords(a: CharacterRecord, b: CharacterRecord): number {
  return a.canonicalName.localeCompare(b.canonicalName) || a.id.localeCompare(b.id);
}

function isNonCharacterEntity(
  entity: CreativeEntity,
): entity is CreativeEntity & { readonly kind: Exclude<CreativeEntityKind, 'character'> } {
  return entity.kind !== 'character';
}
