import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createLegacyAssetMigrationArchive,
  createNodeLegacyAssetMigrationArchiveHost,
  type LegacyAssetMigrationArchiveHost,
  type LegacyAssetProjectionSnapshot,
} from '../legacy-asset-migration-archive';
import {
  inspectLegacyAssetCatalog,
  type LegacyAssetCatalogInspectionSession,
} from '../legacy-asset-catalog-inspector';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('legacy Asset migration archive', () => {
  it('verifies every source before writing one content-addressed immutable archive', async () => {
    const host = new MemoryArchiveHost(
      new Map([
        ['neko/assets/library.json', jsonBytes({ version: 1, entities: [] })],
        ['neko/entity-bindings.json', jsonBytes({ version: 1, bindings: [] })],
      ]),
      new Map([
        [
          'asset-search',
          {
            revision: 'search-revision-1',
            records: [{ partition: 'asset-library', assetId: 'asset-alice' }],
          },
        ],
      ]),
    );
    const session = await inspect(host);
    const before = host.snapshotProjectFiles();

    const archive = await createLegacyAssetMigrationArchive({
      session,
      host,
      verifiedAt: '2026-07-21T02:00:00.000Z',
    });

    expect(archive).toMatchObject({
      status: 'verified',
      archiveId: expect.stringMatching(/^archive-[a-f0-9]{24}$/u),
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      workspacePath: expect.stringMatching(
        /^neko\/migrations\/asset-catalog\/[a-f0-9]{64}\.json$/u,
      ),
      sources: session.inspection.precondition.sources,
    });
    expect(host.snapshotProjectFiles()).toEqual(before);
    expect(host.writes).toEqual([archive.workspacePath]);

    const second = await createLegacyAssetMigrationArchive({
      session,
      host,
      verifiedAt: '2026-07-21T02:01:00.000Z',
    });
    expect(second.digest).toBe(archive.digest);
    expect(second.workspacePath).toBe(archive.workspacePath);
  });

  it('aborts before archive write when a project source changed', async () => {
    const host = new MemoryArchiveHost(
      new Map([['neko/assets/library.json', jsonBytes({ version: 1, entities: [] })]]),
    );
    const session = await inspect(host, false);
    host.files.set(
      'neko/assets/library.json',
      jsonBytes({ version: 1, entities: [{ id: 'changed' }] }),
    );
    const before = host.snapshotAllFiles();

    await expect(createArchive(session, host)).rejects.toMatchObject({ code: 'source-changed' });
    expect(host.writes).toEqual([]);
    expect(host.snapshotAllFiles()).toEqual(before);
  });

  it('aborts before archive write when the project revision changed', async () => {
    const host = new MemoryArchiveHost(
      new Map([['neko/assets/library.json', jsonBytes({ version: 1, entities: [] })]]),
    );
    const session = await inspect(host, false);
    host.projectRevision = 'revision-2';
    const before = host.snapshotAllFiles();

    await expect(createArchive(session, host)).rejects.toMatchObject({ code: 'source-changed' });
    expect(host.writes).toEqual([]);
    expect(host.snapshotAllFiles()).toEqual(before);
  });

  it('aborts before archive write when a local projection changed', async () => {
    const host = new MemoryArchiveHost(
      new Map([['neko/assets/library.json', jsonBytes({ version: 1, entities: [] })]]),
      new Map([
        ['asset-search', { revision: 'search-revision-1', records: [{ id: 'asset-alice' }] }],
      ]),
    );
    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-21T01:00:00.000Z',
      reader: host,
      files: [catalogFile()],
      searchProjection: {
        sourceId: 'asset-search',
        revision: 'search-revision-1',
        records: [{ id: 'asset-alice' }],
      },
    });
    host.projections.set('asset-search', {
      revision: 'search-revision-2',
      records: [{ id: 'asset-alice' }],
    });

    await expect(createArchive(session, host)).rejects.toMatchObject({ code: 'source-changed' });
    expect(host.writes).toEqual([]);
  });

  it('leaves all project bytes unchanged when archive storage fails', async () => {
    const host = new MemoryArchiveHost(
      new Map([['neko/assets/library.json', jsonBytes({ version: 1, entities: [] })]]),
    );
    const session = await inspect(host, false);
    const before = host.snapshotAllFiles();
    host.failWrites = true;

    await expect(createArchive(session, host)).rejects.toMatchObject({
      code: 'archive-write-failed',
    });
    expect(host.snapshotAllFiles()).toEqual(before);
  });

  it('writes and reopens the archive through the Node host without replacing it', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-asset-archive-'));
    tempRoots.push(workspaceRoot);
    await mkdir(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    const catalogBytes = jsonBytes({ version: 1, entities: [] });
    await writeFile(path.join(workspaceRoot, 'neko', 'assets', 'library.json'), catalogBytes);
    const host = createNodeLegacyAssetMigrationArchiveHost({
      workspaceRoot,
      readProjectRevision: async () => 'revision-1',
    });
    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-21T01:00:00.000Z',
      reader: host,
      files: [catalogFile()],
    });

    const archive = await createArchive(session, host);
    const firstBytes = await readFile(
      path.join(workspaceRoot, ...archive.workspacePath.split('/')),
    );
    const repeated = await createArchive(session, host);
    const repeatedBytes = await readFile(
      path.join(workspaceRoot, ...repeated.workspacePath.split('/')),
    );

    expect(repeated).toMatchObject({
      digest: archive.digest,
      workspacePath: archive.workspacePath,
    });
    expect(repeatedBytes).toEqual(firstBytes);
    expect(
      bytesEqual(
        await readFile(path.join(workspaceRoot, 'neko', 'assets', 'library.json')),
        catalogBytes,
      ),
    ).toBe(true);
  });
});

class MemoryArchiveHost implements LegacyAssetMigrationArchiveHost {
  readonly writes: string[] = [];
  failWrites = false;
  projectRevision = 'revision-1';

  constructor(
    readonly files: Map<string, Uint8Array>,
    readonly projections = new Map<string, LegacyAssetProjectionSnapshot>(),
  ) {}

  async readWorkspaceFile(workspacePath: string): Promise<Uint8Array | undefined> {
    return this.files.get(workspacePath)?.slice();
  }

  async readProjectRevision(): Promise<string> {
    return this.projectRevision;
  }

  async readLocalProjection(sourceId: string): Promise<LegacyAssetProjectionSnapshot | undefined> {
    return structuredClone(this.projections.get(sourceId));
  }

  async writeImmutableWorkspaceFile(input: {
    readonly workspacePath: string;
    readonly bytes: Uint8Array;
  }): Promise<void> {
    if (this.failWrites) throw new Error('injected archive write failure');
    const existing = this.files.get(input.workspacePath);
    if (existing && !bytesEqual(existing, input.bytes)) throw new Error('immutable conflict');
    this.files.set(input.workspacePath, input.bytes.slice());
    this.writes.push(input.workspacePath);
  }

  snapshotProjectFiles(): readonly [string, readonly number[]][] {
    return this.snapshotAllFiles().filter(
      ([workspacePath]) => !workspacePath.startsWith('neko/migrations/asset-catalog/'),
    );
  }

  snapshotAllFiles(): readonly [string, readonly number[]][] {
    return [...this.files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([workspacePath, bytes]) => [workspacePath, [...bytes]]);
  }
}

async function inspect(
  host: MemoryArchiveHost,
  includeSearch = true,
): Promise<LegacyAssetCatalogInspectionSession> {
  const search = host.projections.get('asset-search');
  return inspectLegacyAssetCatalog({
    projectRevision: 'revision-1',
    inspectedAt: '2026-07-21T01:00:00.000Z',
    reader: host,
    files: [
      catalogFile(),
      {
        sourceId: 'entity-bindings',
        role: 'entity-bindings',
        workspacePath: 'neko/entity-bindings.json',
      },
    ],
    ...(includeSearch && search
      ? {
          searchProjection: {
            sourceId: 'asset-search',
            revision: search.revision,
            records: search.records,
          },
        }
      : {}),
  });
}

function catalogFile() {
  return {
    sourceId: 'asset-catalog',
    role: 'asset-catalog',
    workspacePath: 'neko/assets/library.json',
    required: true,
  } as const;
}

function createArchive(
  session: LegacyAssetCatalogInspectionSession,
  host: LegacyAssetMigrationArchiveHost,
) {
  return createLegacyAssetMigrationArchive({
    session,
    host,
    verifiedAt: '2026-07-21T02:00:00.000Z',
  });
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}
