import { describe, expect, it } from 'vitest';
import {
  createHostContentPolicySnapshot,
  createHostWorkspacePathVariables,
  createMediaLibraryPathVariableMap,
  readMediaLibraryLocalSettings,
  readMediaLibrarySettings,
  resolveWorkspaceMediaLibrariesSync,
} from '../workspace-content-settings';

describe('workspace content settings', () => {
  it('resolves media libraries with local overrides and path variables', () => {
    const settings = readMediaLibrarySettings(
      {
        mediaLibraries: [
          { name: 'Workspace Assets', path: 'assets', variable: 'ASSETS' },
          { name: 'External Assets', path: '${HOME}/media', variable: 'MEDIA' },
          { name: 'Disabled', path: 'disabled', variable: 'OFF', enabled: false },
        ],
      },
      'settings.json',
    );
    const localSettings = readMediaLibraryLocalSettings(
      {
        mediaLibraryOverrides: {
          MEDIA: '/Volumes/media',
        },
      },
      'settings.local.json',
    );

    const libraries = resolveWorkspaceMediaLibrariesSync({
      settings,
      localSettings,
      workspaceRoot: '/workspace/project',
      resolvePath: (source, workspaceRoot) =>
        source.startsWith('/') ? source : `${workspaceRoot}/${source}`,
      checkAccessible: (resolvedPath) => resolvedPath !== '/workspace/project/disabled',
    });
    const variables = createMediaLibraryPathVariableMap(libraries);

    expect(libraries).toEqual([
      {
        name: 'Workspace Assets',
        resolvedPath: '/workspace/project/assets',
        originalPath: 'assets',
        variable: 'ASSETS',
        enabled: true,
        accessible: true,
        overridden: false,
      },
      {
        name: 'External Assets',
        resolvedPath: '/Volumes/media',
        originalPath: '${HOME}/media',
        variable: 'MEDIA',
        enabled: true,
        accessible: true,
        overridden: true,
      },
      {
        name: 'Disabled',
        resolvedPath: '/workspace/project/disabled',
        originalPath: 'disabled',
        variable: 'OFF',
        enabled: false,
        accessible: false,
        overridden: false,
      },
    ]);
    expect(variables.get('ASSETS')).toBe('/workspace/project/assets');
    expect(variables.get('MEDIA')).toBe('/Volumes/media');
    expect(variables.get('OFF')).toBeUndefined();
  });

  it('projects a host content policy with authorized workspace and accessible media roots', () => {
    const policy = createHostContentPolicySnapshot({
      workspaceRoot: '/workspace/project',
      settings: {},
      localSettings: {},
      mediaLibraries: [
        {
          name: 'Assets',
          resolvedPath: '/media/assets',
          originalPath: '/media/assets',
          variable: 'ASSETS',
          enabled: true,
          accessible: true,
          overridden: false,
        },
        {
          name: 'Offline',
          resolvedPath: '/media/offline',
          originalPath: '/media/offline',
          variable: 'OFFLINE',
          enabled: true,
          accessible: false,
          overridden: false,
        },
        {
          name: 'Disabled',
          resolvedPath: '/media/disabled',
          originalPath: '/media/disabled',
          variable: 'DISABLED',
          enabled: false,
          accessible: true,
          overridden: false,
        },
      ],
      mediaLibraryPathVariables: new Map([['ASSETS', '/media/assets']]),
      pathVariables: new Map([
        ['WORKSPACE', '/workspace/project'],
        ['ASSETS', '/media/assets'],
      ]),
    });

    expect(policy.pathVariables.get('ASSETS')).toBe('/media/assets');
    expect(policy.mediaLibraryRoots).toEqual(['/media/assets']);
    expect(policy.authorizedReadRoots).toEqual(['/workspace/project', '/media/assets']);
  });

  it('creates canonical workspace variables and allows explicit overrides', () => {
    const variables = createHostWorkspacePathVariables({
      workspaceRoot: '/workspace/project',
      homedir: '/Users/me',
      nekoHome: '/Users/me/.neko',
      extraPathVariables: new Map([['A', '/media/assets']]),
    });

    expect(variables.get('A')).toBe('/media/assets');
    expect(variables.get('WORKSPACE')).toBe('/workspace/project');
    expect(variables.get('PROJECT')).toBe('/workspace/project');
    expect(variables.get('HOME')).toBe('/Users/me');
    expect(variables.get('NEKO_HOME')).toBe('/Users/me/.neko');
  });
});
