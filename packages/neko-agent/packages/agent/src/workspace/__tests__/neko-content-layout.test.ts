import { describe, expect, it } from 'vitest';
import {
  resolveAgentsFile,
  resolveNekoContentDir,
  resolvePersonalAgentsFile,
  resolvePersonalNekoContentDir,
  resolveProjectAgentsFile,
  resolveProjectNekoContentDir,
} from '../neko-content-layout';

describe('neko-content-layout', () => {
  it('resolves personal content directories under the user neko directory', () => {
    expect(resolvePersonalNekoContentDir('/home/user', 'prompts')).toBe('/home/user/.neko/prompts');
    expect(resolvePersonalNekoContentDir('/home/user', 'skills')).toBe('/home/user/.neko/skills');
  });

  it('resolves project content directories only when a workspace root exists', () => {
    expect(resolveProjectNekoContentDir('/repo', 'commands')).toBe('/repo/.neko/commands');
    expect(resolveProjectNekoContentDir(undefined, 'commands')).toBeNull();
  });

  it('resolves source-scoped content directories', () => {
    expect(
      resolveNekoContentDir({
        source: 'personal',
        subdir: 'commands',
        homeDir: '/home/user',
      }),
    ).toBe('/home/user/.neko/commands');
    expect(
      resolveNekoContentDir({
        source: 'project',
        subdir: 'commands',
        homeDir: '/home/user',
        workspaceRoot: '/repo',
      }),
    ).toBe('/repo/.neko/commands');
  });

  it('resolves AGENTS.md paths for personal and project scopes', () => {
    expect(resolvePersonalAgentsFile('/home/user')).toBe('/home/user/.neko/AGENTS.md');
    expect(resolveProjectAgentsFile('/repo')).toBe('/repo/.neko/AGENTS.md');
    expect(resolveProjectAgentsFile(null)).toBeNull();
    expect(resolveAgentsFile({ source: 'personal', homeDir: '/home/user' })).toBe(
      '/home/user/.neko/AGENTS.md',
    );
    expect(
      resolveAgentsFile({
        source: 'project',
        homeDir: '/home/user',
        workspaceRoot: '/repo',
      }),
    ).toBe('/repo/.neko/AGENTS.md');
  });
});
