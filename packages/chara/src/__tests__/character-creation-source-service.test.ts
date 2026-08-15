import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterCreationSourceSelection,
  type CharacterDefinition,
} from '@neko/chara/contracts';
import {
  CharacterCreationSourceService,
  type CharacterCreationProjectPort,
  type CharacterCreationSourceAuthority,
} from '../application/character-creation-source-service';
import { describe, expect, it, vi } from 'vitest';

const observedAt = '2026-08-12T10:00:00.000Z';

describe('CharacterCreationSourceService', () => {
  it('keeps portable Character archives outside the creator source contract', () => {
    expect(() =>
      parseCharacterCreationSourceSelection({
        evidence: [
          {
            kind: 'neko-character-archive',
            evidenceId: 'archive:one',
            archiveId: 'portable:one',
            observedAt,
          },
        ],
        assetRepresentations: [],
      }),
    ).toThrow("Unknown Character creation evidence source 'neko-character-archive'");
  });

  it('rejects contentProjectId as a Project identity alias', () => {
    expect(() =>
      parseCharacterCreationSourceSelection({
        evidence: [
          {
            kind: 'project-entity',
            evidenceId: 'evidence:retired-project',
            sourceWorkspaceId: 'workspace:story',
            sourceWorkspaceGrantId: 'grant:story',
            contentProjectId: 'content-project:story',
            entityId: 'entity:lin',
            observedAt,
          },
        ],
        assetRepresentations: [],
      }),
    ).toThrow('contains unsupported fields: contentProjectId');
  });

  it('reviews File, exact Asset and confirmed Entity sources before one fresh CharacterProject write', async () => {
    const authority = authorityFixture();
    const projects = projectPortFixture();
    const service = new CharacterCreationSourceService({ authority, projects });

    const project = await service.createProject({
      characterProjectId: 'character-project:seeded',
      displayName: 'Lin',
      draft: definition('Reviewed prompt output.'),
      sources: {
        evidence: [
          {
            kind: 'content',
            evidenceId: 'evidence:file',
            sourceWorkspaceId: 'workspace:story',
            sourceWorkspaceGrantId: 'grant:story',
            locator: { kind: 'workspace-file', path: 'characters/lin.md' },
            excerpt: 'Lin guards the archive.',
            observedAt,
          },
          {
            kind: 'project-entity',
            evidenceId: 'evidence:entity',
            sourceWorkspaceId: 'workspace:story',
            sourceWorkspaceGrantId: 'grant:story',
            projectId: 'project:story',
            entityId: 'entity:lin',
            observedAt,
          },
        ],
        assetRepresentations: [
          {
            assetId: 'asset:lin-live2d',
            resource: {
              kind: 'package-resource',
              packageId: 'asset:lin-live2d',
              revision: 'publication:summer',
              resourcePath: 'avatar/lin.model3.json',
              digest: 'sha256:lin-model',
            },
            representationId: 'representation:live2d-main',
            representationKind: 'live2d',
          },
        ],
      },
    });

    expect(authority.content.requireReadable).toHaveBeenCalledWith(
      {
        sourceWorkspaceId: 'workspace:story',
        sourceWorkspaceGrantId: 'grant:story',
        locator: { kind: 'workspace-file', path: 'characters/lin.md' },
      },
      undefined,
    );
    expect(authority.projectEntities.requireConfirmedCharacter).toHaveBeenCalledWith(
      {
        sourceWorkspaceId: 'workspace:story',
        sourceWorkspaceGrantId: 'grant:story',
        projectId: 'project:story',
        entityId: 'entity:lin',
      },
      undefined,
    );
    expect(authority.assets.requireRepresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset:lin-live2d',
        resource: expect.objectContaining({
          kind: 'package-resource',
          resourcePath: 'avatar/lin.model3.json',
        }),
      }),
      undefined,
    );
    expect(projects.createProject).toHaveBeenCalledTimes(1);
    expect(projects.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        characterProjectId: 'character-project:seeded',
        draft: expect.objectContaining({ summary: 'Reviewed prompt output.' }),
        seed: {
          evidence: [
            expect.objectContaining({
              evidenceId: 'evidence:file',
              sourceRef: expect.stringMatching(/^content:/u),
            }),
            {
              evidenceId: 'evidence:entity',
              sourceRef: 'project-entity:project%3Astory/entity%3Alin',
              observedAt,
            },
          ],
          representationRefs: [
            {
              representationId: 'representation:live2d-main',
              kind: 'live2d',
              resourceRef: expect.stringMatching(/^asset:asset%3Alin-live2d\//u),
            },
          ],
        },
      }),
      undefined,
    );
    expect(project.characterProjectId).toBe('character-project:seeded');
    expect(project.reviewStatus).toBe('draft');
  });

  it('routes manual creation through the same project port with an empty reviewed seed', async () => {
    const authority = authorityFixture();
    const projects = projectPortFixture();
    const service = new CharacterCreationSourceService({ authority, projects });

    await service.createProject({
      characterProjectId: 'character-project:manual',
      displayName: 'Manual',
      draft: definition('Manual definition.'),
      sources: { evidence: [], assetRepresentations: [] },
    });

    expect(projects.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        characterProjectId: 'character-project:manual',
        seed: { evidence: [], representationRefs: [] },
      }),
      undefined,
    );
    expect(authority.content.requireReadable).not.toHaveBeenCalled();
    expect(authority.assets.requireRepresentation).not.toHaveBeenCalled();
    expect(authority.projectEntities.requireConfirmedCharacter).not.toHaveBeenCalled();
  });

  it('does not write a CharacterProject when an owning source rejects the selection', async () => {
    const authority = authorityFixture();
    authority.assets.requireRepresentation.mockRejectedValue(
      new Error('Asset resource is unavailable.'),
    );
    const projects = projectPortFixture();
    const service = new CharacterCreationSourceService({ authority, projects });

    await expect(
      service.createProject({
        characterProjectId: 'character-project:rejected',
        displayName: 'Rejected',
        draft: definition(),
        sources: {
          evidence: [],
          assetRepresentations: [
            {
              assetId: 'asset:missing',
              resource: {
                kind: 'package-resource',
                packageId: 'asset:missing',
                revision: 'publication:missing',
                resourcePath: 'avatar/missing.model3.json',
              },
              representationId: 'representation:missing',
              representationKind: 'live2d',
            },
          ],
        },
      }),
    ).rejects.toThrow('Asset resource is unavailable.');
    expect(projects.createProject).not.toHaveBeenCalled();
  });

  it('rejects direct representation refs before source review or project persistence', async () => {
    const authority = authorityFixture();
    const projects = projectPortFixture();
    const service = new CharacterCreationSourceService({ authority, projects });

    await expect(
      service.createProject({
        characterProjectId: 'character-project:raw-representation',
        displayName: 'Raw representation',
        draft: {
          ...definition(),
          representationRefs: [
            {
              representationId: 'avatar-main',
              kind: 'vrm',
              resourceRef: 'asset:unreviewed',
            },
          ],
        },
        sources: { evidence: [], assetRepresentations: [] },
      }),
    ).rejects.toThrow('must supply representation resources through reviewed sources');
    expect(authority.assets.requireRepresentation).not.toHaveBeenCalled();
    expect(projects.createProject).not.toHaveBeenCalled();
  });

  it('rejects duplicate evidence before consulting owners or writing a project', async () => {
    const authority = authorityFixture();
    const projects = projectPortFixture();
    const service = new CharacterCreationSourceService({ authority, projects });
    const duplicate = {
      kind: 'content' as const,
      evidenceId: 'evidence:duplicate',
      sourceWorkspaceId: 'workspace:story',
      sourceWorkspaceGrantId: 'grant:story',
      locator: { kind: 'workspace-file' as const, path: 'characters/lin.md' },
      observedAt,
    };

    await expect(
      service.createProject({
        characterProjectId: 'character-project:duplicate',
        displayName: 'Duplicate',
        draft: definition(),
        sources: { evidence: [duplicate, duplicate], assetRepresentations: [] },
      }),
    ).rejects.toThrow("duplicate identity 'evidence:duplicate'");
    expect(authority.content.requireReadable).not.toHaveBeenCalled();
    expect(projects.createProject).not.toHaveBeenCalled();
  });
});

function authorityFixture() {
  return {
    content: { requireReadable: vi.fn(async () => undefined) },
    assets: { requireRepresentation: vi.fn(async () => undefined) },
    projectEntities: { requireConfirmedCharacter: vi.fn(async () => undefined) },
  } satisfies CharacterCreationSourceAuthority;
}

function projectPortFixture() {
  const prepare = async (input: Parameters<CharacterCreationProjectPort['createProject']>[0]) => ({
    characterProjectId: input.characterProjectId,
    displayName: input.displayName,
    draft: {
      ...input.draft,
      representationRefs: [
        ...input.draft.representationRefs,
        ...(input.seed?.representationRefs ?? []),
      ],
    },
    evidence: input.seed?.evidence ?? [],
    candidates: [],
    reviewStatus: 'draft' as const,
    createdAt: observedAt,
    updatedAt: observedAt,
  });
  return {
    prepareProject: vi.fn(prepare),
    createProject: vi.fn(prepare),
  } satisfies CharacterCreationProjectPort;
}

function definition(summary = ''): CharacterDefinition {
  return {
    summary,
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}
