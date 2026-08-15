import { describe, expect, it } from 'vitest';
import {
  ProjectEntityContractError,
  assertProjectEntityDocument,
  createEmptyProjectEntityDocument,
  decodeProjectEntityDocument,
  encodeProjectEntityDocument,
  isProjectEntityCandidateProjection,
  type ProjectEntityDocument,
  type ProjectEntityRecord,
} from './project-entity-document';

const DIGEST_A = 'a'.repeat(64);

describe('Project Entity document contract', () => {
  it('round-trips every supported Project Entity kind', () => {
    const kinds = ['character', 'scene', 'object', 'location', 'style'] as const;
    const document = createDocument(
      kinds.map((kind, index) =>
        createEntity({
          entityId: `${kind}-${String(index + 1)}`,
          kind,
          canonical: `${kind} ${String(index + 1)}`,
        }),
      ),
    );

    expect(JSON.parse(encodeProjectEntityDocument(document))).toEqual(document);
    expect(assertProjectEntityDocument(document).entities.map((entity) => entity.kind)).toEqual(
      kinds,
    );
  });

  it('keeps exact package revision and digest in an accepted representation binding', () => {
    const entity = createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' });
    const document = createDocument([
      {
        ...entity,
        representations: [
          {
            bindingId: 'binding-rin-portrait',
            role: 'portrait',
            target: {
              kind: 'package-resource',
              packageId: 'asset-rin',
              revision: 'revision-7',
              digest: DIGEST_A,
              resourcePath: 'portraits/rin.png',
            },
            source: 'import',
            isDefault: true,
            acceptedAt: '2026-08-05T01:00:00.000Z',
          },
        ],
      },
    ]);

    const decoded = decodeProjectEntityDocument(document);

    expect(decoded).toEqual({ ok: true, document, diagnostics: [] });
  });

  it('persists Media Library identity instead of its managed Workspace projection', () => {
    const entity = createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' });
    const representation = {
      bindingId: 'binding-rin-portrait',
      role: 'portrait' as const,
      source: 'user' as const,
      acceptedAt: '2026-08-05T01:00:00.000Z',
    };
    expect(
      assertProjectEntityDocument(
        createDocument([
          {
            ...entity,
            representations: [
              {
                ...representation,
                target: {
                  kind: 'media-library',
                  libraryName: 'Characters',
                  relativePath: 'portraits/rin.png',
                },
              },
            ],
          },
        ]),
      ),
    ).toBeTruthy();
    expect(() =>
      assertProjectEntityDocument(
        createDocument([
          {
            ...entity,
            representations: [
              {
                ...representation,
                target: {
                  kind: 'workspace-file',
                  path: 'neko/assets/Characters/portraits/rin.png',
                },
              },
            ],
          },
        ]),
      ),
    ).toThrow(ProjectEntityContractError);
  });

  it('diagnoses unsupported document fields and rejects former facts and provenance authority', () => {
    const valid = createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' });
    expect(
      decodeProjectEntityDocument({ ...createDocument([]), unexpectedField: 1 }),
    ).toMatchObject({
      ok: true,
      document: createDocument([]),
      diagnostics: [{ code: 'invalid-project-entity-document' }],
    });
    expect(decodeProjectEntityDocument({ ...createDocument([]), candidates: [] })).toMatchObject({
      ok: true,
      document: createDocument([]),
      diagnostics: [{ code: 'invalid-project-entity-document' }],
    });
    expect(
      decodeProjectEntityDocument({
        projectId: 'project-neko',
        entities: [
          valid,
          {
            ...createEntity({
              entityId: 'character-with-facts',
              kind: 'character',
              canonical: 'Facts',
            }),
            facts: { availability: 'active' },
          },
          {
            ...createEntity({
              entityId: 'character-with-provenance',
              kind: 'character',
              canonical: 'Provenance',
            }),
            provenance: { formerAssetLineage: true },
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      document: { entities: [valid] },
      diagnostics: [
        { code: 'invalid-project-entity-document', entityId: 'character-with-facts' },
        { code: 'invalid-project-entity-document', entityId: 'character-with-provenance' },
      ],
    });
  });

  it('rejects duplicate Entity and binding identities', () => {
    const entity = createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' });
    expect(decodeProjectEntityDocument(createDocument([entity, entity]))).toMatchObject({
      ok: true,
      document: { entities: [entity] },
      diagnostics: [{ code: 'duplicate-project-entity-id', entityId: 'character-rin' }],
    });

    const binding = {
      bindingId: 'binding-shared',
      role: 'portrait' as const,
      target: { kind: 'workspace-file' as const, path: 'portraits/rin.png' },
      source: 'user' as const,
      acceptedAt: '2026-08-05T01:00:00.000Z',
    };
    expect(
      decodeProjectEntityDocument(
        createDocument([
          { ...entity, representations: [binding] },
          {
            ...createEntity({
              entityId: 'character-mio',
              kind: 'character',
              canonical: 'Mio',
            }),
            representations: [binding],
          },
        ]),
      ),
    ).toMatchObject({
      ok: true,
      document: { entities: [expect.objectContaining({ entityId: entity.entityId })] },
      diagnostics: [{ code: 'duplicate-project-entity-binding-id', bindingId: 'binding-shared' }],
    });
  });

  it('requires package bindings to include an exact digest', () => {
    const entity = createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' });
    const document = createDocument([
      {
        ...entity,
        representations: [
          {
            bindingId: 'binding-rin-portrait',
            role: 'portrait',
            target: {
              kind: 'package-resource',
              packageId: 'asset-rin',
              revision: 'revision-7',
              resourcePath: 'portraits/rin.png',
            },
            source: 'import',
            acceptedAt: '2026-08-05T01:00:00.000Z',
          },
        ],
      },
    ]);

    expect(decodeProjectEntityDocument(document)).toMatchObject({
      ok: true,
      document: { entities: [] },
      diagnostics: [{ code: 'invalid-project-entity-document' }],
    });
  });

  it('validates lifecycle references within the exact document', () => {
    const deprecated = {
      ...createEntity({ entityId: 'character-old', kind: 'character', canonical: 'Old Rin' }),
      lifecycle: {
        state: 'deprecated' as const,
        deprecatedAt: '2026-08-05T02:00:00.000Z',
        replacementEntityId: 'character-rin',
      },
    };
    const document = createDocument([
      deprecated,
      createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' }),
    ]);

    expect(assertProjectEntityDocument(document)).toEqual(document);
    expect(decodeProjectEntityDocument(createDocument([deprecated]))).toMatchObject({
      ok: true,
      document: { entities: [] },
      diagnostics: [{ code: 'invalid-project-entity-document', entityId: 'character-old' }],
    });
  });

  it('keeps valid sibling Entities available with exact diagnostics for invalid records', () => {
    const valid = createEntity({
      entityId: 'character-rin',
      kind: 'character',
      canonical: 'Rin',
    });
    const decoded = decodeProjectEntityDocument({
      ...createDocument([]),
      entities: [
        valid,
        {
          ...createEntity({
            entityId: 'character-invalid',
            kind: 'character',
            canonical: 'Invalid',
          }),
          names: { canonical: '', aliases: [] },
        },
      ],
    });

    expect(decoded).toEqual({
      ok: true,
      document: createDocument([valid]),
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-project-entity-document',
          entityId: 'character-invalid',
        }),
      ],
    });
    expect(() =>
      assertProjectEntityDocument({
        ...createDocument([]),
        entities: [
          valid,
          { ...valid, entityId: 'character-invalid', names: { canonical: '', aliases: [] } },
        ],
      }),
    ).toThrow(ProjectEntityContractError);
  });

  it('reports unsupported document fields without hiding independently valid records', () => {
    const entity = createEntity({
      entityId: 'character-rin',
      kind: 'character',
      canonical: 'Rin',
    });
    const decoded = decodeProjectEntityDocument({
      ...createDocument([entity]),
      unsupportedField: 'preserved',
    });

    expect(decoded).toEqual({
      ok: true,
      document: createDocument([entity]),
      diagnostics: [
        {
          code: 'invalid-project-entity-document',
          message: 'Project Entity document contains unsupported fields: unsupportedField.',
        },
      ],
    });
    expect(() =>
      assertProjectEntityDocument({
        ...createDocument([entity]),
        unsupportedField: 'preserved',
      }),
    ).toThrow(ProjectEntityContractError);
  });

  it('keeps candidate evidence outside the canonical document and preserves its owner', () => {
    expect(
      isProjectEntityCandidateProjection({
        candidateId: 'candidate-rin',
        kind: 'character',
        proposedNames: { canonical: 'Rin', aliases: [] },
        confidence: 0.82,
        freshness: 'fresh',
        evidence: [
          {
            evidenceId: 'evidence-script-rin',
            owner: 'document',
            sourceId: 'script-main',
            locator: { kind: 'workspace-file', path: 'scripts/main.fountain' },
            observedAt: '2026-08-05T03:00:00.000Z',
          },
          {
            evidenceId: 'evidence-asset-rin',
            owner: 'managed-asset',
            sourceId: 'asset-rin',
          },
        ],
      }),
    ).toBe(true);
  });

  it('creates an empty canonical document without guessing a Project identity', () => {
    expect(createEmptyProjectEntityDocument('project-neko')).toEqual({
      projectId: 'project-neko',
      entities: [],
    });
    expect(() => createEmptyProjectEntityDocument('/Users/example/project')).toThrowError(
      ProjectEntityContractError,
    );
  });
});

function createDocument(entities: readonly ProjectEntityRecord[]): ProjectEntityDocument {
  return {
    projectId: 'project-neko',
    entities,
  };
}

function createEntity(input: {
  readonly entityId: string;
  readonly kind: ProjectEntityRecord['kind'];
  readonly canonical: string;
}): ProjectEntityRecord {
  return {
    entityId: input.entityId,
    kind: input.kind,
    names: { canonical: input.canonical, aliases: [] },
    representations: [],
    lifecycle: { state: 'active' },
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
}
