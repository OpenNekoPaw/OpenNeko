import { describe, expect, it } from 'vitest';
import {
  projectEntityManagement,
  type EntityBindingAvailabilityProjectionValue,
  type ProjectEntityCandidateProjection,
  type ProjectEntityDocument,
} from '../../index';

describe('Project Entity management projection', () => {
  it('projects confirmed, needs-attention, deprecated, and merged cross-owner candidates', () => {
    const projections = projectEntityManagement({
      document: DOCUMENT,
      bindingAvailability: [ATTENTION],
      candidates: [
        candidate('workspace', 'evidence-workspace'),
        candidate('document', 'evidence-doc'),
      ],
    });

    expect(projections.map(({ projectionId, status }) => ({ projectionId, status }))).toEqual([
      { projectionId: 'entity:character-rin', status: 'needs-attention' },
      { projectionId: 'entity:location-school', status: 'deprecated' },
      { projectionId: 'candidate:candidate-nova', status: 'candidate' },
    ]);
    expect(projections[2]).toMatchObject({
      sourceOwners: ['workspace', 'document'],
      candidate: { evidence: [{ owner: 'workspace' }, { owner: 'document' }] },
    });
  });

  it('fails visibly for stale binding ownership and conflicting candidate semantics', () => {
    expect(() =>
      projectEntityManagement({
        document: DOCUMENT,
        bindingAvailability: [{ ...ATTENTION, entityId: 'missing' }],
        candidates: [],
      }),
    ).toThrow('does not belong');
    expect(() =>
      projectEntityManagement({
        document: DOCUMENT,
        bindingAvailability: [],
        candidates: [
          candidate('workspace', 'evidence-workspace'),
          { ...candidate('document', 'evidence-doc'), kind: 'location' },
        ],
      }),
    ).toThrow('conflicting semantic projections');
  });
});

function candidate(
  owner: ProjectEntityCandidateProjection['evidence'][number]['owner'],
  evidenceId: string,
): ProjectEntityCandidateProjection {
  return {
    candidateId: 'candidate-nova',
    kind: 'character',
    proposedNames: { canonical: 'Nova', aliases: [] },
    confidence: owner === 'workspace' ? 0.8 : 0.9,
    freshness: 'fresh',
    evidence: [{ evidenceId, owner, sourceId: `${owner}:story` }],
  };
}

const DOCUMENT: ProjectEntityDocument = {
  projectId: 'project-neko',
  entities: [
    {
      entityId: 'character-rin',
      kind: 'character',
      names: { canonical: 'Rin', aliases: [] },
      representations: [
        {
          bindingId: 'binding-rin',
          role: 'portrait',
          target: { file: { authority: 'workspace', path: 'rin.png' } },
          source: 'user',
          acceptedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
      lifecycle: { state: 'active' },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
    {
      entityId: 'location-school',
      kind: 'location',
      names: { canonical: 'School', aliases: [] },
      representations: [],
      lifecycle: { state: 'deprecated', deprecatedAt: '2026-08-05T01:00:00.000Z' },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T01:00:00.000Z',
    },
  ],
};

const ATTENTION: EntityBindingAvailabilityProjectionValue = {
  bindingId: 'binding-rin',
  entityId: 'character-rin',
  entityKind: 'character',
  representation: { file: { authority: 'workspace', path: 'rin.png' } },
  role: 'portrait',
  owner: 'workspace-file',
  availability: 'needs-attention',
  attention: {
    diagnostic: { code: 'content-missing' },
    action: 'rebind',
  },
  checkedAt: '2026-08-05T02:00:00.000Z',
};
