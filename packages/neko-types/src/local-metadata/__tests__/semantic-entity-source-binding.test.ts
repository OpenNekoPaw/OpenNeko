import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SemanticEntitySourceCommitRequest } from '../node-workspace-semantic-entity-metadata-binding';
import { createNodeWorkspaceSemanticEntityMetadataBinding } from '../node-workspace-semantic-entity-metadata-binding';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('workspace semantic/entity metadata binding', () => {
  it('atomically replaces and deletes source-scoped evidence and entity projections', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-semantic-entity-binding-'));
    const workDir = join(homedir, 'workspace');
    temporaryDirectories.push(homedir);
    const binding = await createNodeWorkspaceSemanticEntityMetadataBinding({
      homedir,
      workDir,
      createWorkspaceId: () => '56f0b16b-a627-4d47-bcf4-42a15a119dae',
      now: () => '2026-07-18T00:00:00.000Z',
    });
    const request = commitRequest();
    await binding.replaceSource(request);

    await expect(binding.getSource(request.source.sourceId)).resolves.toMatchObject({
      sourceFingerprint: request.source.fingerprint,
      freshness: 'fresh',
    });
    await expect(binding.listSources('workspace')).resolves.toEqual([request.source]);
    await expect(binding.listAutomaticCandidates()).resolves.toEqual([
      expect.objectContaining({ id: 'candidate:auto:character:nova' }),
    ]);
    await expect(binding.readSemanticRevision()).resolves.toMatchObject({ freshness: 'fresh' });
    await expect(binding.readEntityRevision()).resolves.toMatchObject({ freshness: 'fresh' });

    await expect(
      binding.replaceSource({
        ...request,
        expectedStoredFingerprint: 'sha256:wrong',
        source: { ...request.source, fingerprint: 'sha256:new' },
        result: {
          ...request.result,
          sourceFingerprint: 'sha256:new',
          index: { ...request.result.index, updatedAt: request.updatedAt },
        },
      }),
    ).rejects.toThrow('changed before metadata commit');
    await expect(binding.getSource(request.source.sourceId)).resolves.toMatchObject({
      sourceFingerprint: request.source.fingerprint,
    });

    await expect(
      binding.deleteSource(request.source.sourceId, '2026-07-18T00:01:00.000Z'),
    ).resolves.toBe(true);
    await expect(binding.getSource(request.source.sourceId)).resolves.toBeNull();
    await expect(binding.listAutomaticCandidates()).resolves.toEqual([]);
    await binding.dispose();
  });
});

function commitRequest(): SemanticEntitySourceCommitRequest {
  const updatedAt = '2026-07-18T00:00:00.000Z';
  const source = {
    sourceId: 'workspace:story.fountain',
    workspaceId: '56f0b16b-a627-4d47-bcf4-42a15a119dae',
    rootId: 'workspace',
    rootKind: 'workspace' as const,
    relativePath: 'story.fountain',
    portablePath: `${'${WORKSPACE}'}/story.fountain`,
    format: 'fountain' as const,
    analysisMode: 'discover-candidates' as const,
    fingerprint: 'sha256:story-v1',
    sizeBytes: 100,
    modifiedAtMs: 1,
  };
  const candidate = {
    id: 'candidate:auto:character:nova',
    kind: 'character' as const,
    name: 'Nova',
    status: 'open' as const,
    identityBasis: 'user-named' as const,
    provenance: [
      {
        providerId: 'neko.text-entity.deterministic',
        sourceKind: 'document' as const,
        sourceRef: source.portablePath,
      },
    ],
    sourceRefs: [source.portablePath],
    metadata: {
      projectionKind: 'automatic-entity-candidate',
      normalizedName: 'nova',
      reviewStatus: 'observed',
      sourceOccurrenceCount: 1,
      explicitStructuralMentionCount: 1,
      mentionIds: ['mention-1'],
      entityRevision: 'entities-v1',
    },
  };
  return {
    source,
    expectedStoredFingerprint: null,
    updatedAt,
    result: {
      sourceId: source.sourceId,
      sourceFingerprint: source.fingerprint,
      entityRevision: 'entities-v1',
      index: {
        version: 1,
        indexId: source.sourceId,
        assetId: source.sourceId,
        sourceRef: { kind: 'file', path: source.portablePath },
        updatedAt,
      },
      mentions: [],
      occurrences: [],
      candidates: [candidate],
      diagnostics: [],
    },
  };
}
