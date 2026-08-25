import type {
  CharacterGlobalCatalogService,
  SynchronizeCharacterInput,
} from '@neko/chara-domain/application';
import type { WorldGlobalCatalogService, SynchronizeWorldInput } from '@neko/world-domain/application';
import {
  parseProjectWorkspaceObjectMutation,
  type ProjectWorkspaceObjectMutation,
} from '../contracts/project-composition';
import type { ProjectWorkspaceAuthority } from '../contracts/project-local-authoring';
import type { ProjectLocalAuthoringService } from './project-local-authoring-service';

export class ProjectWorkspaceObjectMutationService {
  constructor(
    private readonly ports: {
      readonly localAuthoring: Pick<ProjectLocalAuthoringService, 'copyCharacter' | 'copyWorld'>;
      readonly characters: Pick<CharacterGlobalCatalogService, 'synchronize'>;
      readonly worlds: Pick<WorldGlobalCatalogService, 'synchronize'>;
    },
  ) {}

  async execute(
    authority: ProjectWorkspaceAuthority,
    mutationValue: ProjectWorkspaceObjectMutation,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const mutation = parseProjectWorkspaceObjectMutation(mutationValue);
    if (mutation.kind === 'copy-character-reference') {
      await this.ports.localAuthoring.copyCharacter(
        authority,
        {
          globalCharacterId: mutation.reference.globalCharacterId,
          characterVersionId: mutation.reference.characterVersionId,
          characterProjectId: mutation.characterProjectId,
        },
        mutation.entity,
        signal,
      );
      return;
    }
    if (mutation.kind === 'copy-world-reference') {
      await this.ports.localAuthoring.copyWorld(
        authority,
        {
          globalWorldId: mutation.reference.globalWorldId,
          worldVersionId: mutation.reference.worldVersionId,
          worldProjectId: mutation.worldProjectId,
        },
        signal,
      );
      return;
    }
    if (mutation.kind === 'synchronize-character') {
      await this.ports.characters.synchronize(characterSynchronizationInput(mutation), signal);
      return;
    }
    await this.ports.worlds.synchronize(worldSynchronizationInput(mutation), signal);
  }
}

function characterSynchronizationInput(
  mutation: Extract<ProjectWorkspaceObjectMutation, { readonly kind: 'synchronize-character' }>,
): SynchronizeCharacterInput {
  return {
    characterProjectId: mutation.characterProjectId,
    globalCharacterId: mutation.globalCharacterId,
    characterVersionId: mutation.characterVersionId,
    label: mutation.label,
    ...(mutation.lastSyncedCharacterVersionId === undefined
      ? {}
      : { lastSyncedCharacterVersionId: mutation.lastSyncedCharacterVersionId }),
    ...(mutation.conflictChoice === undefined ? {} : { conflictChoice: mutation.conflictChoice }),
  };
}

function worldSynchronizationInput(
  mutation: Extract<ProjectWorkspaceObjectMutation, { readonly kind: 'synchronize-world' }>,
): SynchronizeWorldInput {
  return {
    worldProjectId: mutation.worldProjectId,
    globalWorldId: mutation.globalWorldId,
    worldVersionId: mutation.worldVersionId,
    label: mutation.label,
    ...(mutation.lastSyncedWorldVersionId === undefined
      ? {}
      : { lastSyncedWorldVersionId: mutation.lastSyncedWorldVersionId }),
    ...(mutation.conflictChoice === undefined ? {} : { conflictChoice: mutation.conflictChoice }),
  };
}
