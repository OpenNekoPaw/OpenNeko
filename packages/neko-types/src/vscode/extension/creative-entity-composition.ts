import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  collectCharacterLookupKeys,
  type CharacterRecord,
  normalizeCharacterLookupKey,
} from '../../types/character-registry';
import {
  type CreativeEntity,
  type CreativeEntityKind,
  type CreativeEntityQuery,
  type CreativeEntityRegistry,
  type EntityAssetRequirement,
  type EntityAssetRequirementFile,
  type VisualIdentityDraft,
  type VisualIdentityDraftFile,
  isEntityAssetRequirementFile,
  isVisualIdentityDraftFile,
} from '../../types/creative-entity-asset-composition';
import {
  ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
  ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH,
  assertEntityRepresentationBindingFile,
  createEmptyEntityRepresentationBindingFile,
  normalizeEntityRepresentationBindingFile,
  type EntityRepresentationBinding,
  type EntityRepresentationBindingFile,
} from '../../types/entity-representation-binding';
import { CharacterRegistryService, resolveCharacterRegistryPath } from './character-registry';

export interface CreativeEntityAdapter {
  list(query?: CreativeEntityQuery): Promise<readonly CreativeEntity[]>;
  get(id: string): Promise<CreativeEntity | undefined>;
  resolveByName(name: string, kind?: CreativeEntityKind): Promise<CreativeEntity | undefined>;
}

export function characterRecordToCreativeEntity(record: CharacterRecord): CreativeEntity {
  return {
    id: record.id,
    kind: 'character',
    canonicalName: record.canonicalName,
    displayName: record.displayName,
    aliases: record.aliases,
    status: record.status,
    metadata: record.metadata ? { ...record.metadata } : undefined,
  };
}

export class CharacterRecordAdapter implements CreativeEntityAdapter {
  constructor(private readonly registry: CharacterRegistryService) {}

  static fromWorkspaceRoot(workspaceRoot: string): CharacterRecordAdapter {
    return new CharacterRecordAdapter(
      new CharacterRegistryService(resolveCharacterRegistryPath(workspaceRoot)),
    );
  }

  async list(query: CreativeEntityQuery = {}): Promise<readonly CreativeEntity[]> {
    if (query.kind && query.kind !== 'character') {
      return [];
    }

    const records = await this.registry.list();
    return records
      .map(characterRecordToCreativeEntity)
      .filter((entity) => matchesQuery(entity, query));
  }

  async get(id: string): Promise<CreativeEntity | undefined> {
    const record = await this.registry.getById(id);
    return record ? characterRecordToCreativeEntity(record) : undefined;
  }

  async resolveByName(
    name: string,
    kind?: CreativeEntityKind,
  ): Promise<CreativeEntity | undefined> {
    if (kind && kind !== 'character') {
      return undefined;
    }

    const record = await this.registry.resolveByName(name);
    return record ? characterRecordToCreativeEntity(record) : undefined;
  }
}

export class CreativeEntityRegistryService implements CreativeEntityRegistry {
  constructor(private readonly adapters: readonly CreativeEntityAdapter[]) {}

  static forWorkspaceRoot(workspaceRoot: string): CreativeEntityRegistryService {
    return new CreativeEntityRegistryService([
      CharacterRecordAdapter.fromWorkspaceRoot(workspaceRoot),
    ]);
  }

  async list(query: CreativeEntityQuery = {}): Promise<readonly CreativeEntity[]> {
    const results = await Promise.all(this.adapters.map((adapter) => adapter.list(query)));
    return results.flat();
  }

  async get(id: string): Promise<CreativeEntity | undefined> {
    for (const adapter of this.adapters) {
      const entity = await adapter.get(id);
      if (entity) {
        return entity;
      }
    }

    return undefined;
  }

  async resolveByName(
    name: string,
    kind?: CreativeEntityKind,
  ): Promise<CreativeEntity | undefined> {
    for (const adapter of this.adapters) {
      const entity = await adapter.resolveByName(name, kind);
      if (entity) {
        return entity;
      }
    }

    return undefined;
  }
}

export function resolveEntityRepresentationBindingsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ...ENTITY_REPRESENTATION_BINDING_WORKSPACE_PATH.split('/'));
}

export function resolveVisualIdentityDraftsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'neko', 'visual-identity-drafts.json');
}

export function resolveEntityAssetRequirementsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'neko', 'entity-asset-requirements.json');
}

export { createEmptyEntityRepresentationBindingFile };

export function createEmptyVisualIdentityDraftFile(): VisualIdentityDraftFile {
  return {
    version: 1,
    drafts: [],
  };
}

export function createEmptyEntityAssetRequirementFile(): EntityAssetRequirementFile {
  return {
    version: 1,
    requirements: [],
  };
}

export class EntityRepresentationBindingService {
  private static readonly writeChains = new Map<string, Promise<void>>();

  constructor(private readonly filePath: string) {
    assertNotCachePath(filePath);
  }

  static fromWorkspaceRoot(workspaceRoot: string): EntityRepresentationBindingService {
    return new EntityRepresentationBindingService(
      resolveEntityRepresentationBindingsPath(workspaceRoot),
    );
  }

  async load(): Promise<EntityRepresentationBindingFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return assertEntityRepresentationBindingFile(parsed);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return createEmptyEntityRepresentationBindingFile();
      }
      throw error;
    }
  }

  async save(file: EntityRepresentationBindingFile): Promise<void> {
    assertEntityRepresentationBindingFile(file);

    await EntityRepresentationBindingService.withFileLock(this.filePath, async () => {
      await this.saveUnlocked(file);
    });
  }

  async list(): Promise<readonly EntityRepresentationBinding[]> {
    return (await this.load()).bindings;
  }

  async upsert(binding: EntityRepresentationBinding): Promise<EntityRepresentationBindingFile> {
    return this.mutate((file) => ({
      version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
      bindings: [...file.bindings.filter((candidate) => candidate.id !== binding.id), binding].sort(
        compareBindings,
      ),
    }));
  }

  async setDefault(binding: EntityRepresentationBinding): Promise<EntityRepresentationBindingFile> {
    const nextBinding: EntityRepresentationBinding = {
      ...binding,
      isDefault: true,
    };

    return this.mutate((file) => ({
      version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
      bindings: [
        ...file.bindings
          .filter((candidate) => candidate.id !== nextBinding.id)
          .map((candidate) =>
            isSameEntityRole(candidate, nextBinding) ? omitDefaultFlag(candidate) : candidate,
          ),
        nextBinding,
      ].sort(compareBindings),
    }));
  }

  async remove(id: string): Promise<EntityRepresentationBindingFile> {
    return this.mutate((file) => ({
      version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
      bindings: file.bindings.filter((binding) => binding.id !== id),
    }));
  }

  private async mutate(
    operation: (
      file: EntityRepresentationBindingFile,
    ) => Promise<EntityRepresentationBindingFile> | EntityRepresentationBindingFile,
  ): Promise<EntityRepresentationBindingFile> {
    return EntityRepresentationBindingService.withFileLock(this.filePath, async () => {
      const current = await this.load();
      const next = await operation(current);
      await this.saveUnlocked(next);
      return next;
    });
  }

  private async saveUnlocked(file: EntityRepresentationBindingFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const normalized = normalizeEntityRepresentationBindingFile(
      assertEntityRepresentationBindingFile(file),
    );
    const json = `${JSON.stringify(normalized, null, 2)}\n`;
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, json, 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  private static async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous =
      EntityRepresentationBindingService.writeChains.get(filePath) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const nextChain = previous.catch(() => {}).then(() => gate);
    EntityRepresentationBindingService.writeChains.set(filePath, nextChain);

    await previous.catch(() => {});

    try {
      return await operation();
    } finally {
      release?.();
      const current = EntityRepresentationBindingService.writeChains.get(filePath);
      if (current === nextChain) {
        EntityRepresentationBindingService.writeChains.delete(filePath);
      }
    }
  }
}

export class VisualIdentityDraftService {
  constructor(private readonly filePath: string) {
    assertNotCachePath(filePath);
  }

  static fromWorkspaceRoot(workspaceRoot: string): VisualIdentityDraftService {
    return new VisualIdentityDraftService(resolveVisualIdentityDraftsPath(workspaceRoot));
  }

  async load(): Promise<VisualIdentityDraftFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return isVisualIdentityDraftFile(parsed) ? parsed : createEmptyVisualIdentityDraftFile();
    } catch {
      return createEmptyVisualIdentityDraftFile();
    }
  }

  async list(): Promise<readonly VisualIdentityDraft[]> {
    return (await this.load()).drafts;
  }

  async upsert(draft: VisualIdentityDraft): Promise<VisualIdentityDraftFile> {
    const current = await this.load();
    const next: VisualIdentityDraftFile = {
      version: 1,
      drafts: [...current.drafts.filter((candidate) => candidate.id !== draft.id), draft].sort(
        compareDrafts,
      ),
    };
    await writeJsonAtomic(this.filePath, next);
    return next;
  }
}

export class EntityAssetRequirementService {
  constructor(private readonly filePath: string) {
    assertNotCachePath(filePath);
  }

  static fromWorkspaceRoot(workspaceRoot: string): EntityAssetRequirementService {
    return new EntityAssetRequirementService(resolveEntityAssetRequirementsPath(workspaceRoot));
  }

  async load(): Promise<EntityAssetRequirementFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return isEntityAssetRequirementFile(parsed)
        ? parsed
        : createEmptyEntityAssetRequirementFile();
    } catch {
      return createEmptyEntityAssetRequirementFile();
    }
  }

  async list(): Promise<readonly EntityAssetRequirement[]> {
    return (await this.load()).requirements;
  }

  async upsert(requirement: EntityAssetRequirement): Promise<EntityAssetRequirementFile> {
    const current = await this.load();
    const next: EntityAssetRequirementFile = {
      version: 1,
      requirements: [
        ...current.requirements.filter((candidate) => candidate.id !== requirement.id),
        requirement,
      ].sort(compareRequirements),
    };
    await writeJsonAtomic(this.filePath, next);
    return next;
  }
}

function matchesQuery(entity: CreativeEntity, query: CreativeEntityQuery): boolean {
  if (query.status && entity.status !== query.status) {
    return false;
  }

  const key = query.text ? normalizeCharacterLookupKey(query.text) : '';
  if (!key) {
    return true;
  }

  const lookupKeys =
    entity.kind === 'character'
      ? collectCharacterLookupKeys({
          id: entity.id,
          canonicalName: entity.canonicalName,
          displayName: entity.displayName,
          aliases: entity.aliases,
          status: entity.status,
        })
      : [entity.canonicalName, entity.displayName, ...entity.aliases]
          .filter((value): value is string => typeof value === 'string')
          .map(normalizeCharacterLookupKey);

  return lookupKeys.includes(key);
}

function compareBindings(a: EntityRepresentationBinding, b: EntityRepresentationBinding): number {
  return (
    a.entityKind.localeCompare(b.entityKind) ||
    a.entityId.localeCompare(b.entityId) ||
    a.role.localeCompare(b.role) ||
    a.id.localeCompare(b.id)
  );
}

function isSameEntityRole(a: EntityRepresentationBinding, b: EntityRepresentationBinding): boolean {
  return a.entityKind === b.entityKind && a.entityId === b.entityId && a.role === b.role;
}

function omitDefaultFlag(binding: EntityRepresentationBinding): EntityRepresentationBinding {
  const { isDefault: _isDefault, ...rest } = binding;
  return rest;
}

function compareDrafts(a: VisualIdentityDraft, b: VisualIdentityDraft): number {
  return a.characterId.localeCompare(b.characterId) || a.id.localeCompare(b.id);
}

function compareRequirements(a: EntityAssetRequirement, b: EntityAssetRequirement): number {
  return (
    a.entityKind.localeCompare(b.entityKind) ||
    a.entityId.localeCompare(b.entityId) ||
    a.source.localeCompare(b.source) ||
    a.id.localeCompare(b.id)
  );
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  await fs.rename(tmpPath, filePath);
}

function assertNotCachePath(filePath: string): void {
  const normalized = path.normalize(filePath);
  const segments = normalized.split(path.sep);
  const cacheIndex = segments.lastIndexOf('.cache');
  if (cacheIndex > 0 && segments[cacheIndex - 1] === '.neko') {
    throw new Error('Entity representation bindings must not be stored under .neko/.cache');
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
