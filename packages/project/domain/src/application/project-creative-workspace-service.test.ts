import { describe, expect, it, vi } from 'vitest';
import { ProjectCreativeWorkspaceService } from './project-creative-workspace-service';

describe('ProjectCreativeWorkspaceService', () => {
  it('returns the canonical mixed-domain composition without publication planning', async () => {
    const composition = {
      projectId: 'project-1',
      content: [],
      characters: [],
      worlds: [],
      globalCharacters: [],
      globalWorlds: [],
      availableGlobalCharacters: [],
      availableGlobalWorlds: [],
      diagnostics: [],
    };
    const service = new ProjectCreativeWorkspaceService({
      composition: { read: vi.fn(async () => composition) },
    });

    await expect(service.read({ projectId: 'project-1' })).resolves.toEqual({ composition });
  });
});
