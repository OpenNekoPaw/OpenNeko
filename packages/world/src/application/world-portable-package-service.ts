import {
  parseWorldPortableExportPreview,
  parseWorldPortableExportSelection,
  parseWorldPortableOperationResult,
  parseWorldPortablePackageManifest,
  parseGlobalWorldVersion,
  parseWorldProject,
  parseWorldVersion,
  type WorldAuthoringAuthority,
  type WorldPortableEmbeddedResourceEntry,
  type WorldPortableExportPreview,
  type WorldPortableExportSelection,
  type WorldPortableExternalDependency,
  type WorldPortableOperationResult,
  type WorldPortablePackageManifest,
  type WorldPortableRecordKind,
  type WorldProject,
  type WorldVersion,
} from '@neko/world/contracts';
import type {
  ImportWorldGlobalVersionInput,
  WorldGlobalCatalogService,
  WorldGlobalImportReceipt,
} from './world-global-catalog-service';

export interface WorldPortableRecordSource {
  readonly kind: WorldPortableRecordKind;
  readonly recordId: string;
  readonly archivePath: string;
  readonly bytes: Uint8Array;
}

export interface WorldPortableResourceSource {
  readonly declaration: WorldPortableEmbeddedResourceEntry;
  readonly bytes: Uint8Array;
}

export interface WorldPortableArchiveContent {
  readonly manifest: WorldPortablePackageManifest;
  readonly bytesByArchivePath: ReadonlyMap<string, Uint8Array>;
}

export interface WorldPortableArchivePort {
  write(
    input: {
      readonly worldProjectId: string;
      readonly entryRecordPath: string;
      readonly records: readonly WorldPortableRecordSource[];
      readonly embeddedResources: readonly WorldPortableResourceSource[];
      readonly externalDependencies: readonly WorldPortableExternalDependency[];
    },
    signal?: AbortSignal,
  ): Promise<{
    readonly archiveBytes: Uint8Array;
    readonly manifest: WorldPortablePackageManifest;
  }>;
  read(archiveBytes: Uint8Array, signal?: AbortSignal): Promise<WorldPortableArchiveContent>;
}

export interface WorldPortableWorkspaceRepository {
  readonly authority: WorldAuthoringAuthority;
  readProject(worldProjectId: string, signal?: AbortSignal): Promise<WorldProject | undefined>;
  readPublication(worldVersionId: string, signal?: AbortSignal): Promise<WorldVersion | undefined>;
}

export interface ImportWorldPortablePackageToGlobalInput {
  readonly archiveBytes: Uint8Array;
  readonly target?: ImportWorldGlobalVersionInput['target'];
  readonly globalCatalog: WorldGlobalCatalogService;
}

export interface WorldPortableDependencySelection {
  readonly dependency: WorldPortableExternalDependency;
  readonly resolved: boolean;
}

export interface WorldPortableResourceSelection extends WorldPortableResourceSource {
  readonly authorized: boolean;
}

export class WorldPortablePackageError extends Error {
  constructor(
    readonly code:
      | 'world-package-project-unavailable'
      | 'world-package-version-unavailable'
      | 'world-package-version-owner-mismatch'
      | 'world-package-resource-unavailable'
      | 'world-package-export-not-ready'
      | 'world-package-record-invalid',
    message: string,
  ) {
    super(message);
    this.name = 'WorldPortablePackageError';
  }
}

export class WorldPortablePackageService {
  constructor(
    private readonly repository: WorldPortableWorkspaceRepository | undefined,
    private readonly archive: WorldPortableArchivePort,
  ) {}

  /**
   * Exports the canonical first-closure authoring records. The current World model has no
   * World-owned embeddable resource declarations; source evidence remains inside the records.
   */
  exportAuthoringPackage(
    selection: WorldPortableExportSelection,
    signal?: AbortSignal,
  ): Promise<{
    readonly archiveBytes: Uint8Array;
    readonly manifest: WorldPortablePackageManifest;
    readonly result: WorldPortableOperationResult;
  }> {
    return this.exportPackage(
      {
        selection,
        resources: [],
        dependencies: [],
        destinationAuthorized: true,
      },
      signal,
    );
  }

  async previewExport(
    input: {
      readonly selection: WorldPortableExportSelection;
      readonly resources: readonly WorldPortableResourceSelection[];
      readonly dependencies: readonly WorldPortableDependencySelection[];
      readonly destinationAuthorized: boolean;
    },
    signal?: AbortSignal,
  ): Promise<WorldPortableExportPreview> {
    signal?.throwIfAborted();
    const selection = parseWorldPortableExportSelection(input.selection);
    const project = await this.requireProject(selection.worldProjectId, signal);
    const versions = await this.requireVersions(
      project.worldProjectId,
      [selection.worldVersionId],
      signal,
    );
    const selectedResources = selection.embeddedResourceIds.map((resourceId) => {
      const resource = input.resources.find(
        (candidate) => candidate.declaration.resourceId === resourceId,
      );
      if (!resource) {
        throw worldPackageError(
          'world-package-resource-unavailable',
          `Embedded resource '${resourceId}' is unavailable from its exact owner.`,
        );
      }
      return resource;
    });
    const unresolvedDependencyIds = [
      ...input.dependencies
        .filter((candidate) => candidate.dependency.required && !candidate.resolved)
        .map((candidate) => candidate.dependency.dependencyId),
      ...selectedResources
        .filter((candidate) => !candidate.authorized)
        .map((candidate) => candidate.declaration.resourceId),
    ].sort();
    const records = [
      { kind: 'world-project' as const, recordId: project.worldProjectId },
      ...versions.map((version) => ({
        kind: 'world-version' as const,
        recordId: version.worldVersionId,
      })),
    ];
    const estimatedExpandedBytes =
      encodeRecord(project).byteLength +
      versions.reduce((total, version) => total + encodeRecord(version).byteLength, 0) +
      selectedResources.reduce((total, resource) => total + resource.bytes.byteLength, 0);
    return parseWorldPortableExportPreview({
      selection,
      records,
      embeddedResources: selectedResources.map((resource) => resource.declaration),
      externalDependencies: input.dependencies.map((candidate) => candidate.dependency),
      unresolvedDependencyIds,
      estimatedExpandedBytes,
      destinationAuthorized: input.destinationAuthorized,
      canExport: input.destinationAuthorized && unresolvedDependencyIds.length === 0,
    });
  }

  async exportPackage(
    input: {
      readonly selection: WorldPortableExportSelection;
      readonly resources: readonly WorldPortableResourceSelection[];
      readonly dependencies: readonly WorldPortableDependencySelection[];
      readonly destinationAuthorized: boolean;
    },
    signal?: AbortSignal,
  ): Promise<{
    readonly archiveBytes: Uint8Array;
    readonly manifest: WorldPortablePackageManifest;
    readonly result: WorldPortableOperationResult;
  }> {
    const preview = await this.previewExport(input, signal);
    if (!preview.canExport) {
      throw worldPackageError(
        'world-package-export-not-ready',
        'World package export requires exact destination and dependency authorization.',
      );
    }
    const project = await this.requireProject(preview.selection.worldProjectId, signal);
    const versions = await this.requireVersions(
      project.worldProjectId,
      [preview.selection.worldVersionId],
      signal,
    );
    const records: WorldPortableRecordSource[] = [
      {
        kind: 'world-project',
        recordId: project.worldProjectId,
        archivePath: 'world/project.json',
        bytes: encodeRecord(project),
      },
      ...versions.map((version) => ({
        kind: 'world-version' as const,
        recordId: version.worldVersionId,
        archivePath: `world/versions/${encodeURIComponent(version.worldVersionId)}.json`,
        bytes: encodeRecord(version),
      })),
    ];
    const selectedResourceIds = new Set(preview.selection.embeddedResourceIds);
    const embeddedResources = input.resources.filter((resource) =>
      selectedResourceIds.has(resource.declaration.resourceId),
    );
    const written = await this.archive.write(
      {
        worldProjectId: project.worldProjectId,
        entryRecordPath: 'world/project.json',
        records,
        embeddedResources,
        externalDependencies: preview.externalDependencies,
      },
      signal,
    );
    return {
      ...written,
      result: parseWorldPortableOperationResult({
        kind: 'export-completed',
        worldProjectId: project.worldProjectId,
        worldVersionId: requireSingleVersion(versions).worldVersionId,
        archiveByteLength: written.archiveBytes.byteLength,
      }),
    };
  }

  async importIntoGlobal(
    input: ImportWorldPortablePackageToGlobalInput,
    signal?: AbortSignal,
  ): Promise<WorldGlobalImportReceipt> {
    signal?.throwIfAborted();
    const decoded = await this.decode(input.archiveBytes, signal);
    if (decoded.versions.length !== 1) {
      throw worldPackageError(
        'world-package-record-invalid',
        'A World package must contain exactly one immutable WorldVersion.',
      );
    }
    const version = decoded.versions[0];
    if (version === undefined) {
      throw worldPackageError(
        'world-package-record-invalid',
        'World package does not contain a WorldVersion.',
      );
    }
    const target: ImportWorldGlobalVersionInput['target'] = input.target ?? {
      kind: 'new' as const,
      globalWorldId: decoded.project.worldProjectId,
    };
    const globalVersion = parseGlobalWorldVersion({
      worldVersionId: version.worldVersionId,
      globalWorldId: target.globalWorldId,
      label: version.label,
      definition: version.definition,
      acceptedSourceRefIds: version.acceptedSourceRefIds,
      publishedAt: version.publishedAt,
    });
    if (target.kind === 'new') {
      return input.globalCatalog.importVersion(
        { target, title: decoded.project.title, worldVersion: globalVersion },
        signal,
      );
    }
    return input.globalCatalog.importVersion(
      { target, title: decoded.project.title, worldVersion: globalVersion },
      signal,
    );
  }

  private async decode(archiveBytes: Uint8Array, signal?: AbortSignal) {
    const content = await this.archive.read(archiveBytes, signal);
    const manifest = parseWorldPortablePackageManifest(content.manifest);
    const projectEntry = manifest.records.find(
      (record) => record.archivePath === manifest.entryRecordPath,
    );
    if (!projectEntry) {
      throw worldPackageError(
        'world-package-record-invalid',
        'World package entry is unavailable.',
      );
    }
    const project = parseWorldProject(decodeRecord(content, projectEntry.archivePath));
    if (project.worldProjectId !== manifest.worldProjectId) {
      throw worldPackageError(
        'world-package-record-invalid',
        'World package entry WorldProject identity mismatch.',
      );
    }
    const versions = manifest.records
      .filter((record) => record.kind === 'world-version')
      .map((record) => {
        const version = parseWorldVersion(decodeRecord(content, record.archivePath));
        if (
          version.worldVersionId !== record.recordId ||
          version.worldProjectId !== project.worldProjectId
        ) {
          throw worldPackageError(
            'world-package-record-invalid',
            `WorldVersion '${record.recordId}' has mismatched authority.`,
          );
        }
        return version;
      });
    if (versions.length !== 1) {
      throw worldPackageError(
        'world-package-record-invalid',
        'World package must contain exactly one immutable WorldVersion.',
      );
    }
    const embeddedResources = manifest.embeddedResources.map((declaration) => ({
      declaration,
      bytes: requireArchiveBytes(content, declaration.archivePath),
    }));
    return { content, project, versions, embeddedResources };
  }

  private async requireProject(
    worldProjectId: string,
    signal?: AbortSignal,
  ): Promise<WorldProject> {
    const project = await this.requireRepository().readProject(worldProjectId, signal);
    if (!project) {
      throw worldPackageError(
        'world-package-project-unavailable',
        `WorldProject '${worldProjectId}' is unavailable.`,
      );
    }
    return project;
  }

  private async requireVersions(
    worldProjectId: string,
    identities: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly WorldVersion[]> {
    const versions: WorldVersion[] = [];
    for (const worldVersionId of [...identities].sort()) {
      const version = await this.requireRepository().readPublication(worldVersionId, signal);
      if (!version) {
        throw worldPackageError(
          'world-package-version-unavailable',
          `WorldVersion '${worldVersionId}' is unavailable.`,
        );
      }
      if (version.worldProjectId !== worldProjectId) {
        throw worldPackageError(
          'world-package-version-owner-mismatch',
          `WorldVersion '${worldVersionId}' belongs to another WorldProject.`,
        );
      }
      versions.push(version);
    }
    return versions;
  }

  private requireRepository(): WorldPortableWorkspaceRepository {
    if (!this.repository) {
      throw worldPackageError(
        'world-package-project-unavailable',
        'World package export requires an exact Project Workspace source.',
      );
    }
    return this.repository;
  }
}

function encodeRecord(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function decodeRecord(content: WorldPortableArchiveContent, path: string): unknown {
  const bytes = requireArchiveBytes(content, path);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw worldPackageError(
      'world-package-record-invalid',
      `World package record '${path}' is not canonical UTF-8 JSON.`,
    );
  }
}

function requireArchiveBytes(content: WorldPortableArchiveContent, path: string): Uint8Array {
  const bytes = content.bytesByArchivePath.get(path);
  if (!bytes) {
    throw worldPackageError(
      'world-package-record-invalid',
      `World package entry '${path}' is unavailable.`,
    );
  }
  return bytes;
}

function worldPackageError(
  code: WorldPortablePackageError['code'],
  message: string,
): WorldPortablePackageError {
  return new WorldPortablePackageError(code, message);
}

function requireSingleVersion(versions: readonly WorldVersion[]): WorldVersion {
  const version = versions[0];
  if (version === undefined || versions.length !== 1) {
    throw worldPackageError(
      'world-package-record-invalid',
      'World package must contain exactly one immutable WorldVersion.',
    );
  }
  return version;
}
