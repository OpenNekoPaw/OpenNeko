import { describe, expect, it } from 'vitest';
import {
  createHostContentPolicySnapshot,
  createHostWorkspacePathVariables,
} from '../workspace-content-settings';

describe('workspace content policy', () => {
  it('projects linked libraries without authorizing or storing physical roots', () => {
    const policy = createHostContentPolicySnapshot({
      workspaceRoot: '/workspace/project',
      mediaLibraries: [
        {
          name: 'Assets',
          workspacePath: 'neko/assets/Assets',
          availability: 'available',
        },
        {
          name: 'Offline',
          workspacePath: 'neko/assets/Offline',
          availability: 'unavailable',
          diagnostic: {
            code: 'library-link-broken',
            severity: 'error',
            message: 'Media library link target is unavailable.',
          },
        },
      ],
      pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
    });

    expect(policy.pathVariables.has('ASSETS')).toBe(false);
    expect(policy.mediaLibraries[0]?.workspacePath).toBe('neko/assets/Assets');
    expect(policy.authorizedReadRoots).toEqual(['/workspace/project']);
    expect(JSON.stringify(policy)).not.toContain('/media/');
  });

  it('creates canonical workspace variables and allows explicit unrelated overrides', () => {
    const variables = createHostWorkspacePathVariables({
      workspaceRoot: '/workspace/project',
      homedir: '/Users/me',
      nekoHome: '/Users/me/.neko',
      extraPathVariables: new Map([['CUSTOM', '/other/content']]),
    });

    expect(variables.get('CUSTOM')).toBe('/other/content');
    expect(variables.get('WORKSPACE')).toBe('/workspace/project');
    expect(variables.get('PROJECT')).toBe('/workspace/project');
    expect(variables.get('HOME')).toBe('/Users/me');
    expect(variables.get('NEKO_HOME')).toBe('/Users/me/.neko');
  });
});
