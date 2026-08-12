import type { CharacterCreationSourceAuthority } from '@neko/chara/application';
import { createNodeHostContentReadService } from '@neko/content/node';
import { NodeProjectEntityAuthoringService } from '@neko/entity-node';
import { ProjectCompositionService } from '@neko/project/application';
import { createProjectCompositionFileRepository } from '@neko/project-node';

export interface DesktopCharacterCreationWorkspaceResolution {
  readonly workspace: {
    readonly workspaceId: string;
    readonly workspacePath: string;
  };
}

export interface DesktopCharacterCreationWorkspaceAuthority {
  resolveAuthorizedWorkspace(
    workspaceGrantId: string,
    workspaceId: string,
  ): Promise<DesktopCharacterCreationWorkspaceResolution>;
}

export function createDesktopCharacterCreationSourceAuthority(input: {
  readonly workspaces: DesktopCharacterCreationWorkspaceAuthority;
  readonly assets: CharacterCreationSourceAuthority['assets'];
}): CharacterCreationSourceAuthority {
  return {
    content: {
      requireReadable: async (source, signal) => {
        const resolution = await input.workspaces.resolveAuthorizedWorkspace(
          source.sourceWorkspaceGrantId,
          source.sourceWorkspaceId,
        );
        const result = await createNodeHostContentReadService({
          workspaceRoot: resolution.workspace.workspacePath,
        }).stat(source.locator, { ...(signal ? { signal } : {}) });
        if (result.status !== 'ready') {
          throw new Error(
            `Character creation Content source is unavailable: ${result.diagnostic.code}.`,
          );
        }
      },
    },
    assets: input.assets,
    projectEntities: {
      requireConfirmedCharacter: async (source, signal) => {
        const resolution = await input.workspaces.resolveAuthorizedWorkspace(
          source.sourceWorkspaceGrantId,
          source.sourceWorkspaceId,
        );
        await new ProjectCompositionService(
          createProjectCompositionFileRepository({
            workspaceRoot: resolution.workspace.workspacePath,
          }),
        ).require(source.contentProjectId, signal);
        await new NodeProjectEntityAuthoringService({
          workspace: {
            workspaceId: source.sourceWorkspaceId,
            workspacePath: resolution.workspace.workspacePath,
          },
        }).requireCharacterEntity(source.entityId, signal);
      },
    },
  };
}
