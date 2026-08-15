import type { ContentLocator } from '@neko/content';
import {
  createCharacterAssetRepresentationResourceRef,
  createCharacterContentEvidenceSourceRef,
  createCharacterProjectEntityEvidenceSourceRef,
  parseCharacterCreationSeed,
  parseCharacterCreationSourceSelection,
  type CharacterAssetRepresentationSource,
  type CharacterCreationSeed,
  type CharacterCreationSourceSelection,
  type CharacterProject,
  type CharacterProjectEntityEvidenceSource,
} from '@neko/chara/contracts';
import type { CreateCharacterProjectInput } from './character-authoring-service';

export interface CharacterCreationSourceAuthority {
  readonly content: {
    requireReadable(
      input: {
        readonly sourceWorkspaceId: string;
        readonly sourceWorkspaceGrantId: string;
        readonly locator: ContentLocator;
      },
      signal?: AbortSignal,
    ): Promise<void>;
  };
  readonly assets: {
    requireRepresentation(
      input: CharacterAssetRepresentationSource,
      signal?: AbortSignal,
    ): Promise<void>;
  };
  readonly projectEntities: {
    requireConfirmedCharacter(
      input: Pick<
        CharacterProjectEntityEvidenceSource,
        'sourceWorkspaceId' | 'sourceWorkspaceGrantId' | 'projectId' | 'entityId'
      >,
      signal?: AbortSignal,
    ): Promise<void>;
  };
}

export interface CharacterCreationProjectPort {
  prepareProject(
    input: CreateCharacterProjectInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject>;
  createProject(
    input: CreateCharacterProjectInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject>;
}

export interface CreateCharacterFromSourcesInput extends Omit<CreateCharacterProjectInput, 'seed'> {
  readonly sources: CharacterCreationSourceSelection;
}

export class CharacterCreationSourceService {
  constructor(
    private readonly options: {
      readonly authority: CharacterCreationSourceAuthority;
      readonly projects: CharacterCreationProjectPort;
    },
  ) {}

  async createProject(
    input: CreateCharacterFromSourcesInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    signal?.throwIfAborted();
    requireUnboundFreshDraft(input.draft);
    const seed = await this.review(input.sources, signal);
    return await this.options.projects.createProject(
      {
        characterProjectId: input.characterProjectId,
        displayName: input.displayName,
        draft: input.draft,
        seed,
      },
      signal,
    );
  }

  async prepareProject(
    input: CreateCharacterFromSourcesInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    signal?.throwIfAborted();
    requireUnboundFreshDraft(input.draft);
    const seed = await this.review(input.sources, signal);
    return await this.options.projects.prepareProject(
      {
        characterProjectId: input.characterProjectId,
        displayName: input.displayName,
        draft: input.draft,
        seed,
      },
      signal,
    );
  }

  async review(
    selection: CharacterCreationSourceSelection,
    signal?: AbortSignal,
  ): Promise<CharacterCreationSeed> {
    const sources = parseCharacterCreationSourceSelection(selection);
    for (const source of sources.evidence) {
      signal?.throwIfAborted();
      if (source.kind === 'content') {
        await this.options.authority.content.requireReadable(
          {
            sourceWorkspaceId: source.sourceWorkspaceId,
            sourceWorkspaceGrantId: source.sourceWorkspaceGrantId,
            locator: source.locator,
          },
          signal,
        );
      } else {
        await this.options.authority.projectEntities.requireConfirmedCharacter(
          {
            sourceWorkspaceId: source.sourceWorkspaceId,
            sourceWorkspaceGrantId: source.sourceWorkspaceGrantId,
            projectId: source.projectId,
            entityId: source.entityId,
          },
          signal,
        );
      }
    }
    for (const source of sources.assetRepresentations) {
      signal?.throwIfAborted();
      await this.options.authority.assets.requireRepresentation(source, signal);
    }
    return parseCharacterCreationSeed({
      evidence: sources.evidence.map((source) => ({
        evidenceId: source.evidenceId,
        sourceRef:
          source.kind === 'content'
            ? createCharacterContentEvidenceSourceRef(source)
            : createCharacterProjectEntityEvidenceSourceRef(source),
        ...(source.excerpt === undefined ? {} : { excerpt: source.excerpt }),
        observedAt: source.observedAt,
      })),
      representationRefs: sources.assetRepresentations.map((source) => ({
        representationId: source.representationId,
        kind: source.representationKind,
        resourceRef: createCharacterAssetRepresentationResourceRef(source),
      })),
    });
  }
}

function requireUnboundFreshDraft(draft: CreateCharacterProjectInput['draft']): void {
  if (
    draft.representationRefs.length > 0 ||
    draft.representationDefaults !== undefined ||
    draft.voiceDefaults !== undefined
  ) {
    throw new Error(
      'Fresh Character creation must supply representation resources through reviewed sources.',
    );
  }
}
