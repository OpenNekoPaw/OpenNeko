import { describe, expect, it } from 'vitest';
import {
  PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
  ProjectEntityContractError,
  assertProjectEntityDocument,
  createEmptyProjectEntityDocument,
  decodeProjectEntityDocument,
  encodeProjectEntityDocument,
  isProjectEntityCandidateProjection,
  validateProjectEntityCommitRequest,
  type ProjectEntityDocument,
  type ProjectEntityRecord,
} from './project-entity-document';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

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

    expect(decoded).toEqual({ ok: true, document });
  });

  it('records an immutable import base independently from current Project Entity facts', () => {
    const entity = createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' });
    const document = createDocument([
      {
        ...entity,
        facts: { personality: 'locally edited' },
        provenance: {
          origin: { assetId: 'asset-rin', revision: 'revision-1', digest: DIGEST_A },
          applied: { assetId: 'asset-rin', revision: 'revision-2', digest: DIGEST_B },
          importBase: {
            kind: 'character',
            names: entity.names,
            facts: { personality: 'published base' },
            representations: [],
          },
        },
      },
    ]);

    expect(assertProjectEntityDocument(document).entities[0]?.provenance?.importBase.facts).toEqual(
      {
        personality: 'published base',
      },
    );
  });

  it('rejects unknown versions and projection or workflow authority fields', () => {
    expect(decodeProjectEntityDocument({ ...createDocument([]), schemaVersion: 2 })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'unsupported-project-entity-version' }],
    });
    expect(decodeProjectEntityDocument({ ...createDocument([]), candidates: [] })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-project-entity-document' }],
    });
    expect(
      decodeProjectEntityDocument(
        createDocument([
          {
            ...createEntity({
              entityId: 'character-rin',
              kind: 'character',
              canonical: 'Rin',
            }),
            facts: { availability: 'active' },
          },
        ]),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-project-entity-document' }],
    });
  });

  it('rejects duplicate Entity and binding identities', () => {
    const entity = createEntity({ entityId: 'character-rin', kind: 'character', canonical: 'Rin' });
    expect(decodeProjectEntityDocument(createDocument([entity, entity]))).toMatchObject({
      ok: false,
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
      ok: false,
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
      ok: false,
      diagnostics: [{ code: 'invalid-project-entity-document' }],
    });
  });

  it('validates lifecycle references and expected revision commits', () => {
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

    expect(validateProjectEntityCommitRequest({ expectedRevision: 0, next: document })).toEqual({
      expectedRevision: 0,
      next: document,
    });
    expect(() =>
      validateProjectEntityCommitRequest({ expectedRevision: 1, next: document }),
    ).toThrowError(ProjectEntityContractError);
    expect(decodeProjectEntityDocument(createDocument([deprecated], 1))).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-project-entity-document', entityId: 'character-old' }],
    });
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
      schemaVersion: PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
      projectId: 'project-neko',
      revision: 0,
      entities: [],
    });
    expect(() => createEmptyProjectEntityDocument('/Users/example/project')).toThrowError(
      ProjectEntityContractError,
    );
  });
});

function createDocument(
  entities: readonly ProjectEntityRecord[],
  revision = 1,
): ProjectEntityDocument {
  return {
    schemaVersion: PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
    projectId: 'project-neko',
    revision,
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
    facts: {},
    representations: [],
    lifecycle: { state: 'active' },
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
}
