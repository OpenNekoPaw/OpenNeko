import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  collectCharacterLookupKeys,
  type CharacterRecord,
  normalizeCharacterLookupKey,
} from '../../types/character-registry';
import {
  ASSET_REF_SCHEMES,
  type AssetFederationCapabilityProvider,
  type AssetRefResolver,
  type AssetRefScheme,
  type AssetRefValidation,
  type CreativeEntity,
  type CreativeEntityKind,
  type CreativeEntityQuery,
  type CreativeEntityRegistry,
  type EntityAssetBinding,
  type EntityAssetBindingFile,
  type EntityAssetRequirement,
  type EntityAssetRequirementFile,
  type ParsedAssetRef,
  type RepresentationKind,
  type RepresentationResolveRequest,
  type RepresentationResolveResult,
  DEFAULT_REPRESENTATION_FALLBACKS,
  type ResolvedAssetRef,
  type ResolvedRepresentationFile,
  type VisualIdentityDraft,
  type VisualIdentityDraftFile,
  isEntityAssetBindingFile,
  isEntityAssetRequirementFile,
  isVisualIdentityDraftFile,
} from '../../types/creative-entity-asset-composition';
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

export function resolveEntityAssetBindingsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'neko', 'entity-bindings.json');
}

export function resolveVisualIdentityDraftsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'neko', 'visual-identity-drafts.json');
}

export function resolveEntityAssetRequirementsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'neko', 'entity-asset-requirements.json');
}

export function createEmptyEntityAssetBindingFile(): EntityAssetBindingFile {
  return {
    version: 1,
    bindings: [],
  };
}

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

export type AssetRefBackendResolver = (
  parsed: ParsedAssetRef,
) => Promise<Omit<ResolvedAssetRef, 'ref' | 'scheme'> | undefined>;

export interface DefaultAssetRefResolverOptions {
  readonly project?: AssetRefBackendResolver;
  readonly market?: AssetRefBackendResolver;
  readonly shared?: AssetRefBackendResolver;
  readonly external?: AssetRefBackendResolver;
}

export class DefaultAssetRefResolver implements AssetRefResolver {
  constructor(private readonly backends: DefaultAssetRefResolverOptions = {}) {}

  parse(ref: string): ParsedAssetRef {
    const separatorIndex = ref.indexOf('://');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid assetRef "${ref}": missing scheme`);
    }

    const rawScheme = ref.slice(0, separatorIndex);
    if (!isAssetRefScheme(rawScheme)) {
      throw new Error(`Invalid assetRef "${ref}": unsupported scheme "${rawScheme}"`);
    }

    const rest = ref.slice(separatorIndex + 3);
    const queryIndex = rest.indexOf('?');
    const withoutQuery = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
    const queryString = queryIndex >= 0 ? rest.slice(queryIndex + 1) : '';
    const slashIndex = withoutQuery.indexOf('/');
    const authority = slashIndex >= 0 ? withoutQuery.slice(0, slashIndex) : withoutQuery;
    const refPath = slashIndex >= 0 ? withoutQuery.slice(slashIndex + 1) : '';
    const versionMatch = authority.match(/^(.*)@([^@]+)$/);

    return {
      scheme: rawScheme,
      raw: ref,
      authority: authority || undefined,
      path: refPath,
      version: versionMatch?.[2],
      query: parseAssetRefQuery(queryString),
    };
  }

  validate(ref: string): AssetRefValidation {
    try {
      const parsed = this.parse(ref);
      if (!parsed.authority && !parsed.path) {
        return { valid: false, reason: 'assetRef must include an authority or path' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Invalid assetRef',
      };
    }
  }

  async resolve(ref: string): Promise<ResolvedAssetRef> {
    const parsed = this.parse(ref);
    const backend = this.backends[parsed.scheme];
    const resolved = backend ? await backend(parsed) : undefined;

    if (resolved) {
      return {
        ref,
        scheme: parsed.scheme,
        ...resolved,
      };
    }

    return createFallbackResolvedAssetRef(parsed);
  }
}

export interface RepresentationResolverOptions {
  readonly entities: CreativeEntityRegistry;
  readonly bindings: EntityAssetBindingService;
  readonly assetRefs: AssetRefResolver;
  readonly federation?: AssetFederationCapabilityProvider;
}

export class RepresentationResolver {
  constructor(private readonly options: RepresentationResolverOptions) {}

  async resolve(request: RepresentationResolveRequest): Promise<RepresentationResolveResult> {
    const entity = await this.options.entities.get(request.entityId);
    const allBindings = await this.options.bindings.list();
    const candidates = allBindings.filter(
      (binding) =>
        binding.entityId === request.entityId &&
        (!entity || binding.entityKind === entity.kind) &&
        binding.status === 'confirmed',
    );

    const order = getRepresentationFallbackOrder(request);
    for (const kind of order) {
      const binding = pickBindingForKind(candidates, kind);
      if (!binding) {
        continue;
      }

      const resolvedRef = await this.options.assetRefs.resolve(binding.assetRef);
      const federationSemantics = await this.options.federation?.describeAsset(resolvedRef);
      return {
        status: 'resolved',
        entityId: request.entityId,
        assetRef: binding.assetRef,
        assetEntityId: resolvedRef.assetEntityId,
        resolvedKind: kind,
        fallback: request.preferredKind ? kind !== request.preferredKind : false,
        role: binding.role,
        files:
          federationSemantics?.files && federationSemantics.files.length > 0
            ? federationSemantics.files
            : buildResolvedRepresentationFiles(binding, resolvedRef, kind),
        capabilities: mergeCapabilities(
          resolvedRef.capabilities,
          federationSemantics?.capabilities,
        ),
      };
    }

    return {
      status: 'missing-representation',
      entityId: request.entityId,
      missingKinds: order,
      suggestedActions: ['generate', 'import', 'bind-existing', 'dismiss'],
    };
  }
}

export class EntityAssetBindingService {
  private static readonly writeChains = new Map<string, Promise<void>>();

  constructor(private readonly filePath: string) {
    assertNotCachePath(filePath);
  }

  static fromWorkspaceRoot(workspaceRoot: string): EntityAssetBindingService {
    return new EntityAssetBindingService(resolveEntityAssetBindingsPath(workspaceRoot));
  }

  async load(): Promise<EntityAssetBindingFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      return isEntityAssetBindingFile(parsed) ? parsed : createEmptyEntityAssetBindingFile();
    } catch {
      return createEmptyEntityAssetBindingFile();
    }
  }

  async save(file: EntityAssetBindingFile): Promise<void> {
    if (!isEntityAssetBindingFile(file)) {
      throw new Error('Invalid entity asset binding file');
    }

    await EntityAssetBindingService.withFileLock(this.filePath, async () => {
      await this.saveUnlocked(file);
    });
  }

  async list(): Promise<readonly EntityAssetBinding[]> {
    return (await this.load()).bindings;
  }

  async upsert(binding: EntityAssetBinding): Promise<EntityAssetBindingFile> {
    return this.mutate((file) => ({
      version: 1,
      bindings: [...file.bindings.filter((candidate) => candidate.id !== binding.id), binding].sort(
        compareBindings,
      ),
    }));
  }

  async setDefault(binding: EntityAssetBinding): Promise<EntityAssetBindingFile> {
    const nextBinding: EntityAssetBinding = {
      ...binding,
      isDefault: true,
    };

    return this.mutate((file) => ({
      version: 1,
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

  async remove(id: string): Promise<EntityAssetBindingFile> {
    return this.mutate((file) => ({
      version: 1,
      bindings: file.bindings.filter((binding) => binding.id !== id),
    }));
  }

  private async mutate(
    operation: (
      file: EntityAssetBindingFile,
    ) => Promise<EntityAssetBindingFile> | EntityAssetBindingFile,
  ): Promise<EntityAssetBindingFile> {
    return EntityAssetBindingService.withFileLock(this.filePath, async () => {
      const current = await this.load();
      const next = await operation(current);
      await this.saveUnlocked(next);
      return next;
    });
  }

  private async saveUnlocked(file: EntityAssetBindingFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const normalized: EntityAssetBindingFile = {
      version: 1,
      bindings: [...file.bindings].sort(compareBindings),
    };
    const json = `${JSON.stringify(normalized, null, 2)}\n`;
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, json, 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }

  private static async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous = EntityAssetBindingService.writeChains.get(filePath) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const nextChain = previous.catch(() => {}).then(() => gate);
    EntityAssetBindingService.writeChains.set(filePath, nextChain);

    await previous.catch(() => {});

    try {
      return await operation();
    } finally {
      release?.();
      const current = EntityAssetBindingService.writeChains.get(filePath);
      if (current === nextChain) {
        EntityAssetBindingService.writeChains.delete(filePath);
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

function compareBindings(a: EntityAssetBinding, b: EntityAssetBinding): number {
  return (
    a.entityKind.localeCompare(b.entityKind) ||
    a.entityId.localeCompare(b.entityId) ||
    a.role.localeCompare(b.role) ||
    a.id.localeCompare(b.id)
  );
}

function isSameEntityRole(a: EntityAssetBinding, b: EntityAssetBinding): boolean {
  return a.entityKind === b.entityKind && a.entityId === b.entityId && a.role === b.role;
}

function omitDefaultFlag(binding: EntityAssetBinding): EntityAssetBinding {
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

function getRepresentationFallbackOrder(
  request: RepresentationResolveRequest,
): readonly RepresentationKind[] {
  if (request.allowFallback === false && request.preferredKind) {
    return [request.preferredKind];
  }

  const baseOrder =
    request.fallbackOrder ??
    (request.preferredKind
      ? [
          request.preferredKind,
          ...DEFAULT_REPRESENTATION_FALLBACKS[request.target].filter(
            (kind) => kind !== request.preferredKind,
          ),
        ]
      : DEFAULT_REPRESENTATION_FALLBACKS[request.target]);

  return Array.from(new Set(baseOrder));
}

function pickBindingForKind(
  bindings: readonly EntityAssetBinding[],
  kind: RepresentationKind,
): EntityAssetBinding | undefined {
  const roleBindings = bindings.filter((binding) => binding.role === kind);
  return roleBindings.find((binding) => binding.isDefault) ?? roleBindings[0];
}

function buildResolvedRepresentationFiles(
  binding: EntityAssetBinding,
  resolvedRef: ResolvedAssetRef,
  kind: RepresentationKind,
): readonly ResolvedRepresentationFile[] {
  return [
    {
      role: kind === 'voice' ? 'voice' : kind === 'motion' ? 'motion' : 'main',
      assetRef: binding.assetRef,
      path: resolvedRef.localPath,
      mediaType: kind,
    },
  ];
}

function mergeCapabilities(
  ...capabilityGroups: Array<readonly string[] | undefined>
): readonly string[] {
  return Array.from(new Set(capabilityGroups.flatMap((group) => group ?? []))).sort();
}

function assertNotCachePath(filePath: string): void {
  const normalized = path.normalize(filePath);
  const segments = normalized.split(path.sep);
  const cacheIndex = segments.lastIndexOf('.cache');
  if (cacheIndex > 0 && segments[cacheIndex - 1] === '.neko') {
    throw new Error('Entity asset bindings must not be stored under .neko/.cache');
  }
}

function createFallbackResolvedAssetRef(parsed: ParsedAssetRef): ResolvedAssetRef {
  return {
    ref: parsed.raw,
    scheme: parsed.scheme,
    source: parsed.scheme,
    readonly: parsed.scheme !== 'project',
    assetEntityId: parsed.scheme === 'project' ? parsed.path || parsed.authority : undefined,
    uri: parsed.raw,
  };
}

function isAssetRefScheme(value: string): value is AssetRefScheme {
  return ASSET_REF_SCHEMES.includes(value as AssetRefScheme);
}

function parseAssetRefQuery(query: string): Record<string, string> | undefined {
  if (!query) {
    return undefined;
  }

  const params = new URLSearchParams(query);
  const entries = Array.from(params.entries());
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}
