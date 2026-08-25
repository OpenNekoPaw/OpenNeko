import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SemanticEntitySourceCommitRequest } from './node-workspace-semantic-entity-metadata-binding';
import { createNodeWorkspaceSemanticEntityMetadataBinding } from './node-workspace-semantic-entity-metadata-binding';

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
    const entityPath = join(workDir, 'neko', 'entities.json');
    await mkdir(join(workDir, 'neko'), { recursive: true });
    await writeFile(entityPath, CANONICAL_ENTITY_SOURCE, 'utf8');
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
    await expect(binding.listSources('workspace')).resolves.toEqual({
      sources: [request.source],
      diagnostics: [],
    });
    await expect(binding.listCandidateProjections()).resolves.toEqual([
      expect.objectContaining({ candidateId: 'candidate:auto:character:nova' }),
    ]);
    await expect(binding.findOccurrencesByEntity('char_rin')).resolves.toEqual([
      expect.objectContaining({
        occurrenceId: 'mention-rin:occurrence',
        sourceFingerprint: request.source.fingerprint,
      }),
    ]);
    await expect(
      binding.findEntityLinksByOccurrence('mention-rin:occurrence'),
    ).resolves.toMatchObject({
      entityRefs: [{ entityId: 'char_rin', entityKind: 'character' }],
      candidateIds: [],
    });
    await expect(
      binding.findEntityLinksByOccurrence('mention-nova:occurrence'),
    ).resolves.toMatchObject({
      entityRefs: [],
      candidateIds: ['candidate:auto:character:nova'],
    });
    await expect(
      binding.findEntityLinksByLocator(request.source.sourceId, {
        file: { authority: 'workspace', path: request.source.relativePath },
        selector: { kind: 'text-range', startLine: 1, endLine: 1 },
      }),
    ).resolves.toHaveLength(2);

    await binding.markSourceStale(
      request.source.sourceId,
      'source-changed',
      '2026-07-18T00:00:30.000Z',
    );
    await expect(binding.listCandidateProjections()).resolves.toEqual([
      expect.objectContaining({ freshness: 'stale' }),
    ]);
    await expect(binding.listDiscoveryOccurrences()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: expect.objectContaining({ freshness: 'stale' }) }),
      ]),
    );

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
    await expect(binding.listCandidateProjections()).resolves.toEqual([]);
    await expect(readFile(entityPath, 'utf8')).resolves.toBe(CANONICAL_ENTITY_SOURCE);
    await binding.dispose();
  });

  it('replaces document, managed Asset and Media Library projections without writing Entity facts', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-discovery-owner-binding-'));
    const workDir = join(homedir, 'workspace');
    temporaryDirectories.push(homedir);
    const binding = await createNodeWorkspaceSemanticEntityMetadataBinding({
      homedir,
      workDir,
      createWorkspaceId: () => '56f0b16b-a627-4d47-bcf4-42a15a119dae',
      now: () => '2026-07-18T00:00:00.000Z',
    });

    for (const owner of ['document', 'managed-asset', 'media-library'] as const) {
      const sourceId = `${owner}:nova`;
      await binding.replaceDiscoverySource({
        source: { sourceId, owner, fingerprint: `sha256:${owner}` },
        candidates: [
          {
            candidateId: `candidate:${owner}:nova`,
            kind: 'character',
            proposedNames: { canonical: `Nova ${owner}`, aliases: [] },
            freshness: 'fresh',
            evidence: [{ evidenceId: `evidence:${owner}`, owner, sourceId }],
          },
        ],
        occurrences: [
          occurrence({
            occurrenceId: `occurrence:${owner}`,
            mentionId: `mention:${owner}`,
            candidateId: `candidate:${owner}:nova`,
            label: `Nova ${owner}`,
            sourceId,
            sourceKind: owner,
            sourceFingerprint: `sha256:${owner}`,
          }),
        ],
        updatedAt: '2026-07-18T00:00:00.000Z',
      });
    }

    await expect(binding.listCandidateProjections()).resolves.toHaveLength(3);
    await expect(binding.listDiscoveryOccurrences()).resolves.toHaveLength(3);
    await expect(access(join(workDir, 'neko', 'entities.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
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
    fingerprint: 'sha256:story-content',
    sizeBytes: 100,
    modifiedAtMs: 1,
  };
  const candidate = {
    candidateId: 'candidate:auto:character:nova',
    kind: 'character' as const,
    proposedNames: { canonical: 'Nova', aliases: [] },
    freshness: 'fresh' as const,
    evidence: [
      {
        evidenceId: 'evidence:nova',
        owner: 'workspace' as const,
        sourceId: source.sourceId,
        locator: {
          file: { authority: 'workspace' as const, path: source.relativePath },
        },
      },
    ],
  };
  return {
    source,
    expectedStoredFingerprint: null,
    updatedAt,
    result: {
      sourceId: source.sourceId,
      sourceFingerprint: source.fingerprint,
      index: {
        indexId: source.sourceId,
        assetId: source.sourceId,
        sourceRef: { kind: 'file', path: source.portablePath },
        updatedAt,
      },
      evidence: [],
      mentions: [],
      occurrences: [
        occurrence({
          occurrenceId: 'mention-rin:occurrence',
          mentionId: 'mention-rin',
          entityRef: { entityId: 'char_rin', entityKind: 'character' },
          label: 'Rin',
        }),
        occurrence({
          occurrenceId: 'mention-nova:occurrence',
          mentionId: 'mention-nova',
          candidateId: candidate.candidateId,
          label: 'Nova',
        }),
      ],
      candidates: [candidate],
      diagnostics: [],
    },
  };
}

function occurrence(input: {
  readonly occurrenceId: string;
  readonly mentionId: string;
  readonly entityRef?: { readonly entityId: string; readonly entityKind: 'character' };
  readonly candidateId?: string;
  readonly label: string;
  readonly sourceId?: string;
  readonly sourceKind?: 'workspace' | 'document' | 'managed-asset' | 'media-library';
  readonly sourceFingerprint?: string;
}) {
  const {
    sourceId = 'workspace:story.fountain',
    sourceKind = 'workspace',
    sourceFingerprint = 'sha256:story-content',
    ...occurrenceInput
  } = input;
  return {
    ...occurrenceInput,
    source: {
      sourceId,
      sourceKind,
      sourceRef: '${WORKSPACE}/story.fountain',
      providerId: 'neko.text-entity.deterministic',
      freshness: 'fresh' as const,
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    role: 'reference' as const,
    location: '${WORKSPACE}/story.fountain:1',
    locator: {
      file: { authority: 'workspace' as const, path: 'story.fountain' },
      selector: { kind: 'text-range' as const, startLine: 1, endLine: 1 },
    },
    range: { startLine: 1, endLine: 1 },
    sourceFingerprint,
  };
}

const CANONICAL_ENTITY_SOURCE = `${JSON.stringify(
  {
    projectId: '56f0b16b-a627-4d47-bcf4-42a15a119dae',
    entities: [],
  },
  null,
  2,
)}\n`;
