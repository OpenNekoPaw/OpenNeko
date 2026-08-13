import { describe, expect, it } from 'vitest';
import {
  createHostContentPolicySnapshot,
  createHostWorkspacePathVariables,
} from '../workspace-content-settings';

describe('workspace content policy', () => {
  it('authorizes only the workspace root without projecting Media Library bindings', () => {
    const policy = createHostContentPolicySnapshot({
      workspaceRoot: '/workspace/project',
      pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
    });

    expect(policy.pathVariables.has('ASSETS')).toBe(false);
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
