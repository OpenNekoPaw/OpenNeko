import { describe, expect, it, vi } from 'vitest';
import {
  ProjectCompositionCommitService,
  type ProjectCompositionRepositoryPort,
} from './project-composition-commit-service';

describe('ProjectCompositionCommitService', () => {
  it('commits local membership and exact global references through separate owner facts', async () => {
    const commitTarget = vi.fn<ProjectCompositionRepositoryPort['commitTarget']>();
    const commitGlobalReference =
      vi.fn<ProjectCompositionRepositoryPort['commitGlobalReference']>();
    const replaceGlobalReference =
      vi.fn<ProjectCompositionRepositoryPort['replaceGlobalReference']>();
    const removeGlobalReference =
      vi.fn<ProjectCompositionRepositoryPort['removeGlobalReference']>();
    const service = new ProjectCompositionCommitService({
      repository: {
        commitTarget,
        commitGlobalReference,
        replaceGlobalReference,
        removeGlobalReference,
      },
    });

    await service.addTarget({
      projectId: 'project-1',
      target: { kind: 'character-project', characterProjectId: 'character-project-1' },
    });
    await service.addGlobalReference({
      projectId: 'project-1',
      reference: {
        kind: 'world-version',
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-1',
      },
    });
    await service.updateGlobalReference({
      previous: {
        projectId: 'project-1',
        reference: {
          kind: 'world-version',
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-1',
        },
      },
      next: {
        projectId: 'project-1',
        reference: {
          kind: 'world-version',
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-2',
        },
      },
    });
    await service.removeGlobalReference({
      projectId: 'project-1',
      reference: {
        kind: 'world-version',
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-2',
      },
    });

    expect(commitTarget).toHaveBeenCalledOnce();
    expect(commitGlobalReference).toHaveBeenCalledOnce();
    expect(replaceGlobalReference).toHaveBeenCalledOnce();
    expect(removeGlobalReference).toHaveBeenCalledOnce();
  });
});
