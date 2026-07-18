import type {
  SemanticEntitySnapshot,
  SemanticSourceAnalysisInput,
  SemanticSourceAnalysisResult,
  SemanticSourceDescriptor,
} from '@neko/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  SemanticSourceCoordinator,
  type SemanticSourceFileObservation,
  type SemanticSourceRuntimeScope,
} from '../core/SemanticSourceCoordinator';

const scope: SemanticSourceRuntimeScope = {
  workspaceId: 'workspace-1',
  rootId: 'workspace',
  rootKind: 'workspace',
  portableRoot: '${WORKSPACE}',
  runtimeRoot: '/workspace',
  analysisMode: 'link-existing',
  priority: 0,
};

describe('SemanticSourceCoordinator', () => {
  it('deduplicates event and reconciliation work by fingerprint', async () => {
    const fixture = createFixture([file('story.md', 'sha256:v1')]);
    const coordinator = fixture.coordinator;
    coordinator.setScopes([scope]);
    await coordinator.reconcile('workspace');
    await coordinator.handleHint('workspace', 'story.md', 'change');
    expect(fixture.analyze).toHaveBeenCalledTimes(1);
    expect(fixture.replaceSource).toHaveBeenCalledTimes(1);
  });

  it('reconciliation discovers missed copies and deletes disappeared sources', async () => {
    const fixture = createFixture([file('copied.fountain', 'sha256:v1')]);
    fixture.stored.set('workspace:old.md', descriptor('old.md', 'sha256:old'));
    fixture.storedFingerprints.set('workspace:old.md', 'sha256:old');
    fixture.coordinator.setScopes([scope]);
    const result = await fixture.coordinator.reconcile('workspace');
    expect(result).toMatchObject({ processed: 1, deleted: 1 });
    expect(fixture.deleted).toEqual(['workspace:old.md']);
  });

  it('uses bounded continuations and cancels removed roots', async () => {
    const fixture = createFixture([file('one.md', 'sha256:1'), file('two.md', 'sha256:2')]);
    fixture.coordinator.setScopes([scope]);
    const first = await fixture.coordinator.reconcile('workspace', 1);
    expect(first.continuation).toBe('1');
    const second = await fixture.coordinator.reconcile('workspace', 1);
    expect(second.continuation).toBeUndefined();
    fixture.coordinator.setScopes([]);
    await expect(fixture.coordinator.reconcile('workspace')).rejects.toThrow('Unknown semantic');
  });

  it('suppresses overlapping roots and rejects stale analyzer output', async () => {
    const fixture = createFixture([file('story.md', 'sha256:v1')]);
    fixture.currentFingerprint = 'sha256:v2';
    const diagnostics = fixture.coordinator.setScopes([
      scope,
      {
        ...scope,
        rootId: 'library',
        rootKind: 'media-library',
        portableRoot: '${LIBRARY}',
        runtimeRoot: '/workspace/library',
        priority: 1,
      },
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'semantic-source-root-overlap' }),
    ]);
    await expect(fixture.coordinator.reconcile('library')).rejects.toThrow('Unknown semantic');
    await expect(fixture.coordinator.reconcile('workspace')).resolves.toMatchObject({ skipped: 1 });
    expect(fixture.replaceSource).not.toHaveBeenCalled();
    expect(fixture.markStale).toHaveBeenCalledWith(
      'workspace:story.md',
      'semantic-source-changed-during-analysis',
      expect.any(String),
    );
  });

  it('excludes cache, dependency, secret, and unsupported files', async () => {
    const fixture = createFixture([
      file('node_modules/name.md', 'sha256:1'),
      file('.env.json', 'sha256:2'),
      file('image.png', 'sha256:3'),
      file('notes.txt', 'sha256:4'),
    ]);
    fixture.coordinator.setScopes([scope]);
    await fixture.coordinator.reconcile('workspace');
    expect(fixture.replaceSource).toHaveBeenCalledTimes(1);
    expect(fixture.replaceSource).toHaveBeenCalledWith(
      expect.objectContaining({ source: expect.objectContaining({ relativePath: 'notes.txt' }) }),
    );
  });
});

function createFixture(files: readonly SemanticSourceFileObservation[]) {
  const stored = new Map<string, SemanticSourceDescriptor>();
  const storedFingerprints = new Map<string, string>();
  const deleted: string[] = [];
  let currentFingerprint: string | undefined;
  const analyze = vi.fn(
    async (input: SemanticSourceAnalysisInput): Promise<SemanticSourceAnalysisResult> => ({
      sourceId: input.source.sourceId,
      sourceFingerprint: input.source.fingerprint,
      entityRevision: input.entities.revision,
      index: {
        version: 1,
        assetId: input.source.sourceId,
        sourceRef: { kind: 'file', path: input.source.portablePath },
        updatedAt: input.analyzedAt,
      },
      mentions: [],
      occurrences: [],
      candidates: [],
      diagnostics: [],
    }),
  );
  const replaceSource = vi.fn(async (input: { source: SemanticSourceDescriptor }) => {
    stored.set(input.source.sourceId, input.source);
    storedFingerprints.set(input.source.sourceId, input.source.fingerprint);
  });
  const markStale = vi.fn(async () => undefined);
  const coordinator = new SemanticSourceCoordinator(
    {
      discovery: {
        listFiles: async ({ continuation, limit }) => {
          const start = Number(continuation ?? 0);
          const batch = files.slice(start, start + limit);
          const next = start + batch.length;
          return {
            files: batch,
            ...(next < files.length ? { continuation: String(next) } : {}),
          };
        },
        observeFile: async (_scope, relativePath) =>
          files.find((candidate) => candidate.relativePath === relativePath) ?? null,
        readFile: async () => new TextEncoder().encode('Rin'),
        readFingerprint: async (observation) => currentFingerprint ?? observation.fingerprint,
      },
      projection: {
        getSource: async (sourceId) => {
          const sourceFingerprint = storedFingerprints.get(sourceId);
          return sourceFingerprint ? { sourceId, sourceFingerprint } : null;
        },
        listSources: async (rootId) =>
          [...stored.values()].filter((source) => source.rootId === rootId),
        replaceSource,
        deleteSource: async (sourceId) => {
          const existed = stored.delete(sourceId);
          storedFingerprints.delete(sourceId);
          if (existed) deleted.push(sourceId);
          return existed;
        },
        markSourceStale: markStale,
      },
      getEntitySnapshot: async (): Promise<SemanticEntitySnapshot> => ({
        revision: 'entities-v1',
        entities: [],
      }),
      extractText: ({ source }) => [
        {
          segmentId: `${source.sourceId}:segment:0`,
          kind: 'plain',
          text: 'Rin',
          range: { startOffset: 0, endOffset: 3, startLine: 1, endLine: 1 },
        },
      ],
      now: () => '2026-07-18T00:00:00.000Z',
    },
    { analyzerId: 'test', supports: () => true, analyze },
  );
  return {
    coordinator,
    stored,
    storedFingerprints,
    deleted,
    analyze,
    replaceSource,
    markStale,
    get currentFingerprint() {
      return currentFingerprint;
    },
    set currentFingerprint(value: string | undefined) {
      currentFingerprint = value;
    },
  };
}

function file(relativePath: string, fingerprint: string): SemanticSourceFileObservation {
  return {
    relativePath,
    runtimePath: `/workspace/${relativePath}`,
    sizeBytes: 3,
    modifiedAtMs: 1,
    fingerprint,
  };
}

function descriptor(relativePath: string, fingerprint: string): SemanticSourceDescriptor {
  return {
    sourceId: `workspace:${relativePath}`,
    workspaceId: 'workspace-1',
    rootId: 'workspace',
    rootKind: 'workspace',
    relativePath,
    portablePath: `${'${WORKSPACE}'}/${relativePath}`,
    format: 'markdown',
    analysisMode: 'link-existing',
    fingerprint,
    sizeBytes: 3,
    modifiedAtMs: 1,
  };
}
