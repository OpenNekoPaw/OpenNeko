import type {
  EntityRepresentationBinding,
  EntityRepresentationBindingFile,
  EntityAssetRequirement,
  EntityAssetRequirementFile,
  VisualIdentityDraft,
  VisualIdentityDraftFile,
} from '@neko/shared';
import {
  ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
  assertEntityRepresentationBindingFile,
  createEmptyEntityRepresentationBindingFile,
  isEntityAssetRequirementFile,
  isVisualIdentityDraftFile,
  normalizeEntityRepresentationBindingFile,
} from '@neko/shared';
import type { EntityRuntimePorts } from './ports';
import { SerialEntityRuntimeLock } from './ports';
import {
  assertGitTrackedEntityFactPath,
  resolveEntityRepresentationBindingsPath,
  resolveEntityAssetRequirementsPath,
  resolveVisualIdentityDraftsPath,
} from './paths';

export interface EntityFactServiceOptions {
  readonly projectRoot: string;
  readonly ports: EntityRuntimePorts;
}

export class EntityRepresentationBindingService {
  private readonly filePath: string;
  private readonly lock;

  constructor(private readonly options: EntityFactServiceOptions) {
    this.filePath = resolveEntityRepresentationBindingsPath(options.projectRoot);
    this.lock = options.ports.lock ?? new SerialEntityRuntimeLock();
    assertGitTrackedEntityFactPath(this.filePath);
  }

  static fromProjectRoot(
    projectRoot: string,
    ports: EntityRuntimePorts,
  ): EntityRepresentationBindingService {
    return new EntityRepresentationBindingService({ projectRoot, ports });
  }

  async load(): Promise<EntityRepresentationBindingFile> {
    const parsed = await this.options.ports.files.readJson(this.filePath);
    return parsed === undefined
      ? createEmptyEntityRepresentationBindingFile()
      : assertEntityRepresentationBindingFile(parsed);
  }

  async save(file: EntityRepresentationBindingFile): Promise<void> {
    assertEntityRepresentationBindingFile(file);
    await this.lock.withLock(this.filePath, async () => {
      await this.write(file);
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

  async replaceAll(
    bindings: readonly EntityRepresentationBinding[],
  ): Promise<EntityRepresentationBindingFile> {
    const next: EntityRepresentationBindingFile = {
      version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
      bindings: [...bindings].sort(compareBindings),
    };
    await this.save(next);
    return next;
  }

  private async mutate(
    operation: (file: EntityRepresentationBindingFile) => EntityRepresentationBindingFile,
  ): Promise<EntityRepresentationBindingFile> {
    return this.lock.withLock(this.filePath, async () => {
      const current = await this.load();
      const next = operation(current);
      await this.write(next);
      return next;
    });
  }

  private async write(file: EntityRepresentationBindingFile): Promise<void> {
    await this.options.ports.files.writeJson(
      this.filePath,
      normalizeEntityRepresentationBindingFile(assertEntityRepresentationBindingFile(file)),
    );
  }
}

export class VisualIdentityDraftService {
  private readonly filePath: string;
  private readonly lock;

  constructor(private readonly options: EntityFactServiceOptions) {
    this.filePath = resolveVisualIdentityDraftsPath(options.projectRoot);
    this.lock = options.ports.lock ?? new SerialEntityRuntimeLock();
    assertGitTrackedEntityFactPath(this.filePath);
  }

  static fromProjectRoot(
    projectRoot: string,
    ports: EntityRuntimePorts,
  ): VisualIdentityDraftService {
    return new VisualIdentityDraftService({ projectRoot, ports });
  }

  async load(): Promise<VisualIdentityDraftFile> {
    const parsed = await this.options.ports.files.readJson(this.filePath);
    return isVisualIdentityDraftFile(parsed) ? parsed : createEmptyVisualIdentityDraftFile();
  }

  async list(): Promise<readonly VisualIdentityDraft[]> {
    return (await this.load()).drafts;
  }

  async upsert(draft: VisualIdentityDraft): Promise<VisualIdentityDraftFile> {
    return this.mutate((file) => ({
      version: 1,
      drafts: [...file.drafts.filter((candidate) => candidate.id !== draft.id), draft].sort(
        compareDrafts,
      ),
    }));
  }

  async replaceAll(drafts: readonly VisualIdentityDraft[]): Promise<VisualIdentityDraftFile> {
    const next: VisualIdentityDraftFile = {
      version: 1,
      drafts: [...drafts].sort(compareDrafts),
    };
    await this.lock.withLock(this.filePath, async () => {
      await this.options.ports.files.writeJson(this.filePath, next);
    });
    return next;
  }

  private async mutate(
    operation: (file: VisualIdentityDraftFile) => VisualIdentityDraftFile,
  ): Promise<VisualIdentityDraftFile> {
    return this.lock.withLock(this.filePath, async () => {
      const current = await this.load();
      const next = operation(current);
      await this.options.ports.files.writeJson(this.filePath, next);
      return next;
    });
  }
}

export class EntityAssetRequirementService {
  private readonly filePath: string;
  private readonly lock;

  constructor(private readonly options: EntityFactServiceOptions) {
    this.filePath = resolveEntityAssetRequirementsPath(options.projectRoot);
    this.lock = options.ports.lock ?? new SerialEntityRuntimeLock();
    assertGitTrackedEntityFactPath(this.filePath);
  }

  static fromProjectRoot(
    projectRoot: string,
    ports: EntityRuntimePorts,
  ): EntityAssetRequirementService {
    return new EntityAssetRequirementService({ projectRoot, ports });
  }

  async load(): Promise<EntityAssetRequirementFile> {
    const parsed = await this.options.ports.files.readJson(this.filePath);
    return isEntityAssetRequirementFile(parsed) ? parsed : createEmptyEntityAssetRequirementFile();
  }

  async list(): Promise<readonly EntityAssetRequirement[]> {
    return (await this.load()).requirements;
  }

  async upsert(requirement: EntityAssetRequirement): Promise<EntityAssetRequirementFile> {
    return this.mutate((file) => ({
      version: 1,
      requirements: [
        ...file.requirements.filter((candidate) => candidate.id !== requirement.id),
        requirement,
      ].sort(compareRequirements),
    }));
  }

  async replaceAll(
    requirements: readonly EntityAssetRequirement[],
  ): Promise<EntityAssetRequirementFile> {
    const next: EntityAssetRequirementFile = {
      version: 1,
      requirements: [...requirements].sort(compareRequirements),
    };
    await this.lock.withLock(this.filePath, async () => {
      await this.options.ports.files.writeJson(this.filePath, next);
    });
    return next;
  }

  private async mutate(
    operation: (file: EntityAssetRequirementFile) => EntityAssetRequirementFile,
  ): Promise<EntityAssetRequirementFile> {
    return this.lock.withLock(this.filePath, async () => {
      const current = await this.load();
      const next = operation(current);
      await this.options.ports.files.writeJson(this.filePath, next);
      return next;
    });
  }
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

function compareBindings(a: EntityRepresentationBinding, b: EntityRepresentationBinding): number {
  return (
    a.entityKind.localeCompare(b.entityKind) ||
    a.entityId.localeCompare(b.entityId) ||
    a.role.localeCompare(b.role) ||
    a.id.localeCompare(b.id)
  );
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

function isSameEntityRole(a: EntityRepresentationBinding, b: EntityRepresentationBinding): boolean {
  return a.entityKind === b.entityKind && a.entityId === b.entityId && a.role === b.role;
}

function omitDefaultFlag(binding: EntityRepresentationBinding): EntityRepresentationBinding {
  const { isDefault: _isDefault, ...rest } = binding;
  return rest;
}
