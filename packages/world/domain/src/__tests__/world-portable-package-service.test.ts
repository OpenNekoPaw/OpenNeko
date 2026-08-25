import { describe, expect, it, vi } from 'vitest';

import {
  WorldGlobalCatalogService,
  WorldPortablePackageService,
  type WorldGlobalCatalogRepository,
  type WorldPortableArchiveContent,
  type WorldPortableArchivePort,
  type WorldPortableWorkspaceRepository,
} from '../application';
import {
  parseWorldPortablePackageManifest,
  type GlobalWorldCatalog,
  type WorldProject,
  type WorldVersion,
} from '../contracts';

const digest = `sha256:${'a'.repeat(64)}`;

describe('WorldPortablePackageService', () => {
  it('exports only the exact project, selected immutable version and explicit dependencies', async () => {
    const repository = memoryWorkspaceRepository({
      projects: [project()],
      versions: [version('version-1')],
    });
    const archive = memoryArchive();
    const service = new WorldPortablePackageService(repository, archive.port);

    const result = await service.exportPackage({
      selection: {
        worldProjectId: 'world-1',
        worldVersionId: 'version-1',
        embeddedResourceIds: [],
      },
      resources: [],
      dependencies: [
        {
          dependency: {
            ownerKind: 'character-version',
            dependencyId: 'character-version-1',
            resourceRef: 'neko-character:character-version-1',
            required: true,
          },
          resolved: true,
        },
      ],
      destinationAuthorized: true,
    });

    expect(result.result).toMatchObject({
      kind: 'export-completed',
      worldProjectId: 'world-1',
      worldVersionId: 'version-1',
    });
    expect(archive.write).toHaveBeenCalledWith(
      expect.objectContaining({
        records: [
          expect.objectContaining({ kind: 'world-project', recordId: 'world-1' }),
          expect.objectContaining({ kind: 'world-version', recordId: 'version-1' }),
        ],
      }),
      undefined,
    );
    expect(JSON.stringify(result.manifest)).not.toMatch(
      /worldRun|worldSave|branch|event|Agent|credential|rawPath/u,
    );
  });

  it('fails visibly for missing selected versions and unresolved required dependencies', async () => {
    const service = new WorldPortablePackageService(
      memoryWorkspaceRepository({ projects: [project()], versions: [] }),
      memoryArchive().port,
    );
    await expect(
      service.previewExport({
        selection: {
          worldProjectId: 'world-1',
          worldVersionId: 'missing-version',
          embeddedResourceIds: [],
        },
        resources: [],
        dependencies: [],
        destinationAuthorized: true,
      }),
    ).rejects.toMatchObject({ code: 'world-package-version-unavailable' });

    const readyService = new WorldPortablePackageService(
      memoryWorkspaceRepository({ projects: [project()], versions: [version('version-1')] }),
      memoryArchive().port,
    );
    await expect(
      readyService.previewExport({
        selection: {
          worldProjectId: 'world-1',
          worldVersionId: 'version-1',
          embeddedResourceIds: [],
        },
        resources: [],
        dependencies: [
          {
            dependency: {
              ownerKind: 'asset',
              dependencyId: 'asset-1',
              resourceRef: 'neko-asset:asset-1',
              required: true,
            },
            resolved: false,
          },
        ],
        destinationAuthorized: true,
      }),
    ).resolves.toMatchObject({ unresolvedDependencyIds: ['asset-1'], canExport: false });
  });

  it('imports one validated package directly into the global catalog', async () => {
    const source = memoryWorkspaceRepository({
      projects: [project()],
      versions: [version('version-1')],
    });
    const archive = memoryArchive();
    const service = new WorldPortablePackageService(source, archive.port);
    const exported = await service.exportAuthoringPackage({
      worldProjectId: 'world-1',
      worldVersionId: 'version-1',
      embeddedResourceIds: [],
    });
    const global = memoryGlobalCatalog();

    await expect(
      service.importIntoGlobal({
        archiveBytes: exported.archiveBytes,
        globalCatalog: global.service,
      }),
    ).resolves.toMatchObject({
      globalWorld: {
        globalWorldId: 'world-1',
        currentWorldVersionId: 'version-1',
      },
      worldVersion: { worldVersionId: 'version-1', globalWorldId: 'world-1' },
    });
    await expect(global.service.readCatalog()).resolves.toMatchObject({
      worlds: [{ globalWorldId: 'world-1' }],
      versions: [{ worldVersionId: 'version-1' }],
      links: [],
    });
  });

  it('rejects a repeated global import without mutating the existing history', async () => {
    const source = memoryWorkspaceRepository({
      projects: [project()],
      versions: [version('version-1')],
    });
    const archive = memoryArchive();
    const service = new WorldPortablePackageService(source, archive.port);
    const exported = await service.exportAuthoringPackage({
      worldProjectId: 'world-1',
      worldVersionId: 'version-1',
      embeddedResourceIds: [],
    });
    const global = memoryGlobalCatalog();

    await service.importIntoGlobal({
      archiveBytes: exported.archiveBytes,
      globalCatalog: global.service,
    });
    await expect(
      service.importIntoGlobal({
        archiveBytes: exported.archiveBytes,
        globalCatalog: global.service,
      }),
    ).rejects.toMatchObject({ code: 'global-world-version-conflict' });
    await expect(global.service.readCatalog()).resolves.toMatchObject({
      worlds: [{ worldVersionIds: ['version-1'] }],
      versions: [{ worldVersionId: 'version-1' }],
    });
  });
});

function memoryWorkspaceRepository(input: {
  projects: readonly WorldProject[];
  versions: readonly WorldVersion[];
}): WorldPortableWorkspaceRepository {
  const projects = new Map(input.projects.map((entry) => [entry.worldProjectId, entry]));
  const versions = new Map(input.versions.map((entry) => [entry.worldVersionId, entry]));
  return {
    authority: { kind: 'project', projectId: 'project-1' },
    readProject: async (identity) => structuredClone(projects.get(identity)),
    readPublication: async (identity) => structuredClone(versions.get(identity)),
  };
}

function memoryGlobalCatalog(initial?: GlobalWorldCatalog) {
  let catalog: GlobalWorldCatalog = initial ?? {
    worlds: [],
    versions: [],
    links: [],
    diagnostics: [],
  };
  const repository: WorldGlobalCatalogRepository = {
    readCatalog: async () => structuredClone(catalog),
    commitCatalog: vi.fn(async () => {
      throw new Error('Portable global import cannot create a Workspace link.');
    }),
    commitGlobalCatalog: vi.fn(async ({ world, version }) => {
      catalog = {
        ...catalog,
        worlds: [
          ...catalog.worlds.filter((candidate) => candidate.globalWorldId !== world.globalWorldId),
          structuredClone(world),
        ],
        versions: [...catalog.versions, structuredClone(version)],
      };
    }),
  };
  return {
    service: new WorldGlobalCatalogService({
      repository,
      now: () => '2026-08-15T00:00:00.000Z',
    }),
  };
}

function memoryArchive(): {
  readonly port: WorldPortableArchivePort;
  readonly write: ReturnType<typeof vi.fn>;
} {
  let content: WorldPortableArchiveContent | undefined;
  const write = vi.fn(async (input: Parameters<WorldPortableArchivePort['write']>[0]) => {
    const manifest = parseWorldPortablePackageManifest({
      worldProjectId: input.worldProjectId,
      entryRecordPath: input.entryRecordPath,
      records: input.records.map((entry) => ({
        kind: entry.kind,
        recordId: entry.recordId,
        archivePath: entry.archivePath,
        byteLength: entry.bytes.byteLength,
        integrityDigest: digest,
      })),
      embeddedResources: input.embeddedResources.map((entry) => entry.declaration),
      externalDependencies: input.externalDependencies,
    });
    content = {
      manifest,
      bytesByArchivePath: new Map([
        ...input.records.map((entry) => [entry.archivePath, entry.bytes] as const),
        ...input.embeddedResources.map(
          (entry) => [entry.declaration.archivePath, entry.bytes] as const,
        ),
      ]),
    };
    return { archiveBytes: new Uint8Array([1, 2, 3]), manifest };
  });
  return {
    write,
    port: {
      write,
      read: vi.fn(async () => {
        if (!content) throw new Error('Archive fixture is unavailable.');
        return content;
      }),
    },
  };
}

function project(): WorldProject {
  return {
    worldProjectId: 'world-1',
    title: 'Rain City',
    draft: {
      background: 'A city of archives.',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    sourceRefs: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  };
}

function version(worldVersionId: string): WorldVersion {
  return {
    worldVersionId,
    worldProjectId: 'world-1',
    label: worldVersionId,
    definition: project().draft,
    acceptedSourceRefIds: [],
    publishedAt: '2026-08-14T00:00:00.000Z',
  };
}
