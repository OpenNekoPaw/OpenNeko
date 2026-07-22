import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { classifyLegacyAssetCatalog } from '../legacy-asset-catalog-classifier';
import {
  inspectLegacyAssetCatalog,
  type LegacyAssetCatalogInspectionSession,
} from '../legacy-asset-catalog-inspector';
import {
  applyLegacyAssetMigration,
  approveLegacyAssetMigration,
  createLegacyAssetMigrationDryRun,
  recoverLegacyAssetMigration,
  type LegacyAssetMigrationExecutionHost,
  type LegacyAssetPreparedMigrationOutput,
} from '../legacy-asset-migration-execution';
import type { LegacyAssetProjectionSnapshot } from '../legacy-asset-migration-archive';
import type { LegacyAssetRebuildableProjection } from '../../types/legacy-asset-catalog-migration';

describe('legacy Asset migration execution', () => {
  it('creates a dry run with exact archive, output, unresolved, and confirmation facts', async () => {
    const fixture = await createFixture();

    expect(fixture.plan).toMatchObject({
      version: 1,
      status: 'confirmation-required',
      archive: {
        status: 'planned',
        workspacePath: expect.stringMatching(
          /^neko\/migrations\/asset-catalog\/[a-f0-9]{64}\.json$/u,
        ),
      },
      outputs: [
        {
          kind: 'write-project-file',
          workspacePath: 'neko/entity-representation-bindings.json',
          expectedCurrentDigest: null,
          digest: hashBytes(fixture.bindingsV2),
        },
        {
          kind: 'remove-legacy-file',
          workspacePath: 'neko/assets/library.json',
          expectedDigest: fixture.catalogDigest,
        },
        { kind: 'rebuild-projection', projection: 'media-library-search' },
      ],
    });
    expect(fixture.plan.confirmationIds.length).toBeGreaterThan(0);
    expect(fixture.plan.unresolvedFields.length).toBeGreaterThan(0);
  });

  it('requires the exact explicit confirmation set before apply', async () => {
    const fixture = await createFixture();
    expect(() =>
      approveLegacyAssetMigration({
        plan: fixture.plan,
        confirmationIds: [],
        confirmedAt: '2026-07-22T01:01:00.000Z',
      }),
    ).toThrow('matching explicit approval');
    expect(fixture.host.snapshotProjectState()).toEqual(fixture.before);
  });

  it('applies files and projections only after archive verification', async () => {
    const fixture = await createFixture();
    const approval = approve(fixture);

    const result = await applyLegacyAssetMigration({
      session: fixture.session,
      plan: fixture.plan,
      approval,
      outputs: fixture.outputs,
      host: fixture.host,
      appliedAt: '2026-07-22T01:02:00.000Z',
    });

    expect(result.archive.status).toBe('verified');
    expect(fixture.host.files.has('neko/assets/library.json')).toBe(false);
    expect(fixture.host.files.get('neko/entity-representation-bindings.json')).toEqual(
      fixture.bindingsV2,
    );
    expect(fixture.host.projections.get('media-library-search')).toEqual({ rebuilt: 1 });
    expect(fixture.host.localProjections.has('asset-search')).toBe(false);
    expect(fixture.host.files.has(result.archive.workspacePath)).toBe(true);
  });

  it('rejects a changed output precondition before project mutations', async () => {
    const fixture = await createFixture();
    const approval = approve(fixture);
    fixture.host.files.set(
      'neko/entity-representation-bindings.json',
      jsonBytes({ version: 2, bindings: [{ id: 'concurrent-user-change' }] }),
    );
    const beforeApply = fixture.host.snapshotProjectState();

    await expect(
      applyLegacyAssetMigration({
        session: fixture.session,
        plan: fixture.plan,
        approval,
        outputs: fixture.outputs,
        host: fixture.host,
        appliedAt: '2026-07-22T01:02:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'migration-precondition-failed' });
    expect(fixture.host.snapshotProjectState()).toEqual(beforeApply);
  });

  it('rolls back prior file mutations when a later projection rebuild fails', async () => {
    const fixture = await createFixture();
    const approval = approve(fixture);
    fixture.host.failOperation = 'rebuild-projection';

    await expect(
      applyLegacyAssetMigration({
        session: fixture.session,
        plan: fixture.plan,
        approval,
        outputs: fixture.outputs,
        host: fixture.host,
        appliedAt: '2026-07-22T01:02:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'migration-apply-failed' });

    expect(fixture.host.snapshotProjectState()).toEqual(fixture.before);
    expect(fixture.host.files.has(fixture.plan.archive.workspacePath)).toBe(true);
  });

  it('restores archived inputs and removes migration-created outputs only through recovery', async () => {
    const fixture = await createFixture();
    const approval = approve(fixture);
    const applied = await applyLegacyAssetMigration({
      session: fixture.session,
      plan: fixture.plan,
      approval,
      outputs: fixture.outputs,
      host: fixture.host,
      appliedAt: '2026-07-22T01:02:00.000Z',
    });

    const recovered = await recoverLegacyAssetMigration({
      plan: fixture.plan,
      applyResult: applied,
      host: fixture.host,
      recoveredAt: '2026-07-22T01:03:00.000Z',
    });

    expect(recovered.archiveDigest).toBe(applied.archive.digest);
    expect(fixture.host.snapshotProjectState()).toEqual(fixture.before);
    expect(fixture.host.files.has('neko/entity-representation-bindings.json')).toBe(false);
    expect(fixture.host.localProjections.get('asset-search')).toEqual({
      revision: 'search-revision-1',
      records: [{ partition: 'asset-library', assetId: 'asset-alice' }],
    });
    expect(fixture.host.projections.has('media-library-search')).toBe(false);
  });

  it('fails closed on a tampered archive without changing recovered project facts', async () => {
    const fixture = await createFixture();
    const approval = approve(fixture);
    const applied = await applyLegacyAssetMigration({
      session: fixture.session,
      plan: fixture.plan,
      approval,
      outputs: fixture.outputs,
      host: fixture.host,
      appliedAt: '2026-07-22T01:02:00.000Z',
    });
    fixture.host.files.set(applied.archive.workspacePath, jsonBytes({ tampered: true }));
    const beforeRecovery = fixture.host.snapshotProjectState();

    await expect(
      recoverLegacyAssetMigration({
        plan: fixture.plan,
        applyResult: applied,
        host: fixture.host,
        recoveredAt: '2026-07-22T01:03:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'migration-recovery-failed' });
    expect(fixture.host.snapshotProjectState()).toEqual(beforeRecovery);
  });

  it('refuses recovery after a migrated output receives user changes', async () => {
    const fixture = await createFixture();
    const applied = await applyLegacyAssetMigration({
      session: fixture.session,
      plan: fixture.plan,
      approval: approve(fixture),
      outputs: fixture.outputs,
      host: fixture.host,
      appliedAt: '2026-07-22T01:02:00.000Z',
    });
    fixture.host.files.set(
      'neko/entity-representation-bindings.json',
      jsonBytes({ version: 2, bindings: [{ id: 'user-created-after-migration' }] }),
    );
    const beforeRecovery = fixture.host.snapshotProjectState();

    await expect(
      recoverLegacyAssetMigration({
        plan: fixture.plan,
        applyResult: applied,
        host: fixture.host,
        recoveredAt: '2026-07-22T01:03:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'migration-recovery-failed' });
    expect(fixture.host.snapshotProjectState()).toEqual(beforeRecovery);
  });
});

class MemoryExecutionHost implements LegacyAssetMigrationExecutionHost {
  readonly projections = new Map<LegacyAssetRebuildableProjection, unknown>();
  failOperation: 'rebuild-projection' | undefined;
  projectRevision = 'revision-1';

  constructor(
    readonly files: Map<string, Uint8Array>,
    readonly localProjections: Map<string, LegacyAssetProjectionSnapshot>,
  ) {}

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  async readProjectRevision(): Promise<string> {
    return this.projectRevision;
  }

  async readWorkspaceFile(workspacePath: string): Promise<Uint8Array | undefined> {
    return this.files.get(workspacePath)?.slice();
  }

  async readLocalProjection(sourceId: string): Promise<LegacyAssetProjectionSnapshot | undefined> {
    return structuredClone(this.localProjections.get(sourceId));
  }

  async writeImmutableWorkspaceFile(input: {
    readonly workspacePath: string;
    readonly bytes: Uint8Array;
    readonly digest: string;
  }): Promise<void> {
    if (hashBytes(input.bytes) !== input.digest) throw new Error('archive digest mismatch');
    const existing = this.files.get(input.workspacePath);
    if (existing && hashBytes(existing) !== input.digest) throw new Error('immutable conflict');
    this.files.set(input.workspacePath, input.bytes.slice());
  }

  async writeWorkspaceFileAtomic(workspacePath: string, bytes: Uint8Array): Promise<void> {
    this.files.set(workspacePath, bytes.slice());
  }

  async removeWorkspaceFileAtomic(workspacePath: string): Promise<void> {
    this.files.delete(workspacePath);
  }

  async captureProjection(projection: LegacyAssetRebuildableProjection): Promise<unknown> {
    return structuredClone(this.projections.get(projection));
  }

  async rebuildProjection(projection: LegacyAssetRebuildableProjection): Promise<void> {
    if (this.failOperation === 'rebuild-projection') throw new Error('injected rebuild failure');
    this.projections.set(projection, { rebuilt: 1 });
    if (projection === 'media-library-search') this.localProjections.delete('asset-search');
  }

  async clearProjection(projection: LegacyAssetRebuildableProjection): Promise<void> {
    this.projections.delete(projection);
  }

  async restoreProjection(
    projection: LegacyAssetRebuildableProjection,
    snapshot: unknown,
  ): Promise<void> {
    if (snapshot === undefined) this.projections.delete(projection);
    else this.projections.set(projection, structuredClone(snapshot));
    if (projection === 'media-library-search' && snapshot === undefined) {
      this.localProjections.set('asset-search', {
        revision: 'search-revision-1',
        records: [{ partition: 'asset-library', assetId: 'asset-alice' }],
      });
    }
  }

  async writeLocalProjection(
    sourceId: string,
    snapshot: LegacyAssetProjectionSnapshot,
  ): Promise<void> {
    this.localProjections.set(sourceId, structuredClone(snapshot));
  }

  async removeLocalProjection(sourceId: string): Promise<void> {
    this.localProjections.delete(sourceId);
  }

  snapshotProjectState(): unknown {
    return {
      files: [...this.files.entries()]
        .filter(([workspacePath]) => !workspacePath.startsWith('neko/migrations/asset-catalog/'))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([workspacePath, bytes]) => [workspacePath, [...bytes]]),
      localProjections: [...this.localProjections.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      projections: [...this.projections.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    };
  }
}

async function createFixture() {
  const catalogBytes = jsonBytes({
    version: 1,
    entities: [
      {
        id: 'asset-alice',
        name: 'Alice',
        category: 'character',
        description: 'Preserve only in archive',
        metadata: {},
        variants: [
          {
            id: 'variant-alice',
            files: [
              {
                id: 'file-alice',
                path: 'neko/assets/Characters/alice.png',
                purpose: 'main',
              },
            ],
          },
        ],
      },
    ],
  });
  const host = new MemoryExecutionHost(
    new Map([['neko/assets/library.json', catalogBytes]]),
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
  const session = await inspectLegacyAssetCatalog({
    projectRevision: 'revision-1',
    inspectedAt: '2026-07-22T01:00:00.000Z',
    reader: host,
    files: [
      {
        sourceId: 'asset-catalog',
        role: 'asset-catalog',
        workspacePath: 'neko/assets/library.json',
        required: true,
      },
    ],
    searchProjection: {
      sourceId: 'asset-search',
      revision: 'search-revision-1',
      records: [{ partition: 'asset-library', assetId: 'asset-alice' }],
    },
  });
  const classification = classifyLegacyAssetCatalog({ session });
  const bindingsV2 = jsonBytes({ version: 2, bindings: [] });
  const catalogDigest = sourceDigest(session, 'asset-catalog');
  const outputs: readonly LegacyAssetPreparedMigrationOutput[] = [
    {
      kind: 'write-project-file',
      workspacePath: 'neko/entity-representation-bindings.json',
      expectedCurrentDigest: null,
      bytes: bindingsV2,
    },
    {
      kind: 'remove-legacy-file',
      workspacePath: 'neko/assets/library.json',
      expectedDigest: catalogDigest,
    },
    { kind: 'rebuild-projection', projection: 'media-library-search' },
  ];
  const plan = createLegacyAssetMigrationDryRun({
    session,
    classification,
    outputs,
    createdAt: '2026-07-22T01:00:30.000Z',
  });
  return {
    host,
    session,
    outputs,
    plan,
    bindingsV2,
    catalogDigest,
    before: host.snapshotProjectState(),
  };
}

function approve(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return approveLegacyAssetMigration({
    plan: fixture.plan,
    confirmationIds: fixture.plan.confirmationIds,
    confirmedAt: '2026-07-22T01:01:00.000Z',
  });
}

function sourceDigest(session: LegacyAssetCatalogInspectionSession, sourceId: string): string {
  const source = session.inspection.precondition.sources.find((item) => item.sourceId === sourceId);
  if (!source) throw new Error(`Missing source digest fixture: ${sourceId}`);
  return source.digest;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function hashBytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
