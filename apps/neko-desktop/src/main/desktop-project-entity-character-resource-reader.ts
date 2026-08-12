import { createCharacterAuthoringFileRepository } from '@neko/chara-node';
import { projectEntityCharacterResourceProjections } from '@neko/project/application';
import { createProjectCompositionFileRepository } from '@neko/project-node';
import type { ResourceBrowserNodeSourceOptions } from '@neko/assets-node';

export function createDesktopProjectEntityCharacterResourceReader(): ResourceBrowserNodeSourceOptions['readEntityCharacterResources'] {
  return async ({ identity, workspace }) => {
    const composition = await createProjectCompositionFileRepository({
      workspaceRoot: workspace.workspacePath,
    }).read();
    if (!composition) {
      throw new Error(
        `Resource Browser Project '${identity.projectId}' has no Content Project composition.`,
      );
    }
    if (composition.contentProjectId !== identity.projectId) {
      throw new Error(
        `Resource Browser Project '${identity.projectId}' does not match Content Project '${composition.contentProjectId}'.`,
      );
    }
    const characters = await createCharacterAuthoringFileRepository({
      workspaceRoot: workspace.workspacePath,
      scope: { kind: 'content-project', contentProjectId: identity.projectId },
    }).readAuthoringCatalog();
    return projectEntityCharacterResourceProjections({ composition, characters });
  };
}
