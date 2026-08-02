import { describe, expect, it, vi } from 'vitest';
import { runSystemPromptAgentsFileLoadRuntime } from '../system-prompt-agents-file-runtime';

describe('system-prompt-agents-file-runtime', () => {
  it('passes workspace and explicit personal path to the builder', async () => {
    const loadAgentsFile = vi.fn().mockResolvedValue({
      content: 'project instructions',
      source: 'project',
      path: '/repo/.neko/AGENTS.md',
    });

    await expect(
      runSystemPromptAgentsFileLoadRuntime(
        { workspacePath: '/repo', personalPath: '/home/user/.neko' },
        { builder: { loadAgentsFile } },
      ),
    ).resolves.toEqual({
      content: 'project instructions',
      source: 'project',
      path: '/repo/.neko/AGENTS.md',
    });

    expect(loadAgentsFile).toHaveBeenCalledWith('/repo', '/home/user/.neko');
  });

  it('normalizes missing workspace path while keeping personal fallback in agent', async () => {
    const loadAgentsFile = vi.fn().mockResolvedValue(null);

    await runSystemPromptAgentsFileLoadRuntime(
      { workspacePath: null, personalPath: '/home/user/.neko' },
      { builder: { loadAgentsFile } },
    );

    expect(loadAgentsFile).toHaveBeenCalledWith(undefined, '/home/user/.neko');
  });
});
