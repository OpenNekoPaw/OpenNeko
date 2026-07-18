import type {
  CharacterObservation,
  EntityMemoryContribution,
  CreativeEntityCandidate,
} from '@neko/shared';
import { describe, expect, it } from 'vitest';
import {
  CreativeEntityService,
  EntityContributionAutomationService,
  inspectEntityCandidateFactMigration,
} from '../core';
import { resolveCharacterRegistryPath, resolveEntityCandidateFilePath } from '../core/paths';
import { MemoryEntityFileStore, createFixedClock } from '../testing';

const projectRoot = '/workspace/neko-test';
const now = '2026-06-07T00:00:00.000Z';

describe('EntityContributionAutomationService', () => {
  it('audits legacy candidate provenance without deleting project facts', () => {
    expect(
      inspectEntityCandidateFactMigration({
        version: 1,
        candidates: [
          {
            id: 'candidate:auto',
            kind: 'character',
            name: 'Auto',
            status: 'open',
            identityBasis: 'user-named',
            provenance: [],
            sourceRefs: [],
            metadata: { automationSource: 'entity-memory-contribution' },
          },
          {
            id: 'candidate:user',
            kind: 'character',
            name: 'User',
            status: 'dismissed',
            identityBasis: 'user-named',
            provenance: [],
            sourceRefs: [],
          },
        ],
      }),
    ).toEqual({
      totalCandidates: 2,
      automationGeneratedCandidates: 1,
      preservedCandidateIds: ['candidate:auto', 'candidate:user'],
    });
  });
  it('reuses existing confirmed entities from characters.json', async () => {
    const files = new MemoryEntityFileStore({
      [resolveCharacterRegistryPath(projectRoot)]: {
        version: 1,
        characters: [
          {
            id: 'char_rin',
            canonicalName: 'Rin',
            displayName: 'Rin',
            aliases: ['少年'],
            status: 'confirmed',
          },
        ],
      },
    });
    const service = createAutomation(files);

    const result = await service.processContribution(
      makeContribution({
        entityCandidates: [
          makeCandidate({
            name: '少年',
            confidence: 0.9,
          }),
        ],
      }),
    );

    expect(result.decisions).toEqual([
      expect.objectContaining({
        kind: 'matched-existing',
        name: '少年',
        entityRef: expect.objectContaining({ entityId: 'char_rin', entityKind: 'character' }),
      }),
    ]);
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toBeUndefined();
  });

  it('keeps match-only automation on the read-only path for unknown candidates', async () => {
    const files = new MemoryEntityFileStore();
    const service = createAutomation(files);

    const result = await service.processContribution(
      makeContribution({
        entityCandidates: [makeCandidate({ name: '未确认角色', confidence: 0.99 })],
      }),
      { mode: 'match-only' },
    );

    expect(result.decisions).toEqual([
      expect.objectContaining({
        kind: 'skipped',
        name: '未确认角色',
        reason: expect.stringContaining('candidate creation is disabled'),
      }),
    ]);
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toBeUndefined();
    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toBeUndefined();
  });

  it('merges evidence into an existing open candidate instead of creating duplicates', async () => {
    const files = new MemoryEntityFileStore();
    const entityService = createEntityService(files);
    const existing = await entityService.proposeCandidate({
      kind: 'character',
      name: '少年',
      provenance: [
        {
          providerId: 'fountain-content',
          sourceKind: 'story',
          sourceRef: 'story.fountain:12',
          confidence: 0.8,
        },
      ],
    });
    const automation = new EntityContributionAutomationService(entityService);

    const result = await automation.processContribution(
      makeContribution({
        entityCandidates: [
          makeCandidate({
            name: '少年英雄',
            aliases: ['少年'],
            confidence: 0.91,
          }),
        ],
      }),
    );

    expect(result.decisions).toEqual([
      expect.objectContaining({
        kind: 'matched-candidate',
        candidateId: existing.id,
      }),
    ]);
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toEqual({
      version: 1,
      candidates: [
        expect.objectContaining({
          id: existing.id,
          status: 'open',
          confidence: 0.91,
          aliases: ['少年英雄'],
          provenance: [
            expect.objectContaining({ sourceRef: 'story.fountain:12' }),
            expect.objectContaining({ sourceRef: 'comic/page-21' }),
          ],
        }),
      ],
    });
  });

  it('does not merge name-based contributions into non-user-named candidates', async () => {
    const files = new MemoryEntityFileStore();
    const entityService = createEntityService(files);
    const existing = await entityService.proposeCandidate({
      id: 'candidate:visual:face-1',
      kind: 'character',
      name: '少年',
      identityBasis: 'visual',
      provenance: [
        {
          providerId: 'neko-canvas',
          sourceKind: 'canvas',
          sourceRef: 'canvas://shot-1/face-1',
        },
      ],
    });
    const automation = new EntityContributionAutomationService(entityService);

    const result = await automation.processContribution(
      makeContribution({
        entityCandidates: [makeCandidate({ name: '少年', confidence: 0.91 })],
      }),
    );

    expect(result.decisions).toEqual([
      expect.objectContaining({
        kind: 'created-candidate',
        candidateId: 'candidate:character:char_少年',
      }),
    ]);
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toEqual({
      version: 1,
      candidates: expect.arrayContaining([
        expect.objectContaining({
          id: existing.id,
          identityBasis: 'visual',
        }),
        expect.objectContaining({
          id: 'candidate:character:char_少年',
          identityBasis: 'user-named',
        }),
      ]),
    });
  });

  it('creates reviewable candidates by default without confirming characters.json', async () => {
    const files = new MemoryEntityFileStore();
    const service = createAutomation(files);

    const result = await service.processContribution(
      makeContribution({
        entityCandidates: [makeCandidate({ name: '长发精灵少女', confidence: 0.88 })],
      }),
    );

    expect(result.decisions).toEqual([
      expect.objectContaining({
        kind: 'created-candidate',
        candidateId: 'candidate:character:char_长发精灵少女',
      }),
    ]);
    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toBeUndefined();
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toEqual({
      version: 1,
      candidates: [
        expect.objectContaining({
          id: 'candidate:character:char_长发精灵少女',
          status: 'open',
          name: '长发精灵少女',
        }),
      ],
    });
  });

  it('can auto-confirm source-approved high-confidence candidates when explicitly enabled', async () => {
    const files = new MemoryEntityFileStore();
    const service = createAutomation(files);

    const result = await service.processContribution(
      makeContribution({
        reviewPolicy: 'source-approved',
        entityCandidates: [makeCandidate({ name: '国王使者', confidence: 0.98 })],
      }),
      {
        mode: 'confirm-source-approved',
        minimumAutoConfirmConfidence: 0.95,
      },
    );

    expect(result.decisions).toEqual([
      expect.objectContaining({
        kind: 'confirmed-candidate',
        candidateId: 'candidate:character:char_国王使者',
        entityRef: expect.objectContaining({ entityId: 'char_国王使者' }),
      }),
    ]);
    expect(files.get(resolveCharacterRegistryPath(projectRoot))).toEqual({
      version: 1,
      characters: [
        expect.objectContaining({
          id: 'char_国王使者',
          canonicalName: '国王使者',
          status: 'confirmed',
        }),
      ],
    });
  });

  it('derives candidates from unresolved character observations', async () => {
    const files = new MemoryEntityFileStore();
    const service = createAutomation(files);

    const result = await service.processContribution(
      makeContribution({
        characterObservations: [
          makeObservation({
            observationId: 'obs-hero',
            candidateName: '少年英雄',
            confidence: 0.84,
          }),
        ],
      }),
    );

    expect(result.decisions).toEqual([
      expect.objectContaining({
        kind: 'created-candidate',
        name: '少年英雄',
        candidateId: 'candidate:character:char_少年英雄',
      }),
    ]);
    expect(files.get(resolveEntityCandidateFilePath(projectRoot))).toEqual({
      version: 1,
      candidates: [
        expect.objectContaining({
          name: '少年英雄',
          metadata: expect.objectContaining({
            observationIds: ['obs-hero'],
          }),
        }),
      ],
    });
  });
});

function createAutomation(files: MemoryEntityFileStore): EntityContributionAutomationService {
  return new EntityContributionAutomationService(createEntityService(files));
}

function createEntityService(files: MemoryEntityFileStore): CreativeEntityService {
  return new CreativeEntityService({
    projectRoot,
    ports: { files, clock: createFixedClock(now) },
  });
}

function makeContribution(
  overrides: Partial<EntityMemoryContribution> = {},
): EntityMemoryContribution {
  return {
    contributionId: 'contribution-comic-p21',
    sourcePackage: 'neko-agent',
    sourceRef: { kind: 'tool-result', toolCallId: 'readimage-current-result' },
    reviewPolicy: 'requires-user-review',
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<CreativeEntityCandidate> & { readonly name: string },
): CreativeEntityCandidate {
  const { name, ...rest } = overrides;
  return {
    id: `candidate:character:char_${name}`,
    kind: 'character',
    name,
    status: 'open',
    identityBasis: 'user-named',
    aliases: [],
    confidence: 0.8,
    provenance: [
      {
        providerId: 'neko-agent',
        sourceKind: 'agent',
        sourceRef: 'comic/page-21',
        confidence: overrides.confidence ?? 0.8,
      },
    ],
    sourceRefs: ['comic/page-21'],
    ...rest,
  };
}

function makeObservation(input: {
  readonly observationId: string;
  readonly candidateName: string;
  readonly confidence: number;
}): CharacterObservation {
  return {
    observationId: input.observationId,
    sourceRef: { kind: 'tool-result', toolCallId: 'readimage-current-result' },
    provenance: { source: 'agent', providerId: 'neko-agent' },
    reviewStatus: 'needs-review',
    dimensions: [
      {
        dimension: 'appearance',
        value: '短发少年',
        confidence: input.confidence,
      },
    ],
    mention: {
      mentionId: `${input.observationId}-mention`,
      kind: 'visual',
      candidateName: input.candidateName,
      confidence: input.confidence,
    },
    confidence: input.confidence,
  };
}
