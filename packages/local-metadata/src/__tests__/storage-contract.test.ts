import { describe, expect, it } from 'vitest';
import {
  assertCanonicalMetadataDatabasePath,
  createWorkspacePortableLocator,
  diagnoseDuplicateWorkspaceIdentity,
  decideNekoStorageAuthority,
  ensureWorkspaceIdentityDescriptor,
  getNekoStorageClassification,
  listNekoStorageClassifications,
  markWorkspaceIdentityOrphaned,
  parseWorkspaceIdentityJson,
  resolveManagedLogFile,
  resolveStorageLayout,
  resolveWorkspaceCachePartition,
  serializeWorkspaceIdentityDescriptor,
  updateWorkspaceIdentityBinding,
  type WorkspaceIdentityBinding,
} from '../storage';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';

describe('storage classification', () => {
  it('classifies every canonical storage responsibility', () => {
    expect(listNekoStorageClassifications()).toHaveLength(14);
    expect(getNekoStorageClassification('project-facts')).toMatchObject({
      scope: 'project-fact',
      tracking: 'git-trackable',
      cleanup: 'never-automatic',
    });
    expect(getNekoStorageClassification('valuable-local-state')).toMatchObject({
      metadataOwnership: 'state',
      backup: 'required',
    });
    expect(getNekoStorageClassification('rebuildable-metadata')).toMatchObject({
      metadataOwnership: 'cache',
      cleanup: 'rebuildable-only',
    });
    expect(getNekoStorageClassification('project-local-disposable')).toMatchObject({
      scope: 'project-local',
      storageClass: 'disposable-local-state',
      owner: 'package-owner',
      portability: 'machine-local',
      sqliteRole: 'prohibited',
      tracking: 'gitignored',
    });
    expect(getNekoStorageClassification('conversation-journals')).toMatchObject({
      storageClass: 'raw-journal',
      durability: 'authoritative',
      authorityKind: 'file',
      sqliteRole: 'prohibited',
    });
    expect(getNekoStorageClassification('raw-logs')).toMatchObject({
      owner: 'logger',
      authorityKind: 'log-file',
      sqliteRole: 'prohibited',
      tracking: 'outside-workspace',
    });
    expect(getNekoStorageClassification('secret-credentials')).toMatchObject({
      authorityKind: 'secret-store',
      sensitivity: 'secret',
      sqliteRole: 'prohibited',
    });
  });

  it.each([
    [
      'application settings',
      'structured-state',
      'ui-managed',
      'machine-local',
      'non-secret',
      false,
      'sqlite-state',
    ],
    ['raw logs', 'raw-log', 'opaque', 'machine-local', 'local-sensitive', false, 'log-file'],
    [
      'project facts',
      'user-content',
      'user-content',
      'workspace-portable',
      'non-secret',
      false,
      'file',
    ],
    [
      'portable Agent definitions',
      'structured-state',
      'user-content',
      'user-exportable',
      'local-sensitive',
      false,
      'file',
    ],
    [
      'credentials',
      'structured-state',
      'ui-managed',
      'machine-local',
      'secret',
      false,
      'secret-store',
    ],
    [
      'Pi transcripts',
      'journal',
      'user-content',
      'user-exportable',
      'local-sensitive',
      false,
      'file',
    ],
    [
      'rebuildable index',
      'structured-metadata',
      'opaque',
      'machine-local',
      'local-sensitive',
      true,
      'sqlite-cache',
    ],
    [
      'retained artifact',
      'large-artifact',
      'user-content',
      'user-exportable',
      'non-secret',
      false,
      'file',
    ],
    ['session scratch', 'ephemeral', 'opaque', 'machine-local', 'local-sensitive', false, 'memory'],
  ] as const)(
    'admits %s to its canonical authority',
    (_label, dataKind, userManagement, portability, sensitivity, rebuildable, authorityKind) => {
      expect(
        decideNekoStorageAuthority({
          dataKind,
          userManagement,
          portability,
          sensitivity,
          rebuildable,
        }),
      ).toMatchObject({ authorityKind });
    },
  );

  it('fails visibly for an unknown managed storage classification', () => {
    expect(() => getNekoStorageClassification('package-private-bucket')).toThrowError(
      expect.objectContaining({ code: 'unknown-managed-storage' }),
    );
  });
});

describe('canonical storage layout', () => {
  it('exposes one user database and no workspace database path', () => {
    const layout = resolveStorageLayout('/workspace/demo', '/Users/feng');

    expect(layout.global.database).toBe('/Users/feng/.neko/neko.db');
    expect(layout.global.assets).toBe('/Users/feng/.neko/assets');
    expect(layout.project.facts.identity).toBe('/workspace/demo/neko/project.json');
    expect(layout.project.local).toEqual({
      root: '/workspace/demo/.neko',
      mediaLibraries: '/workspace/demo/.neko/media-libraries',
      presentation: '/workspace/demo/.neko/presentation',
      cache: '/workspace/demo/.neko/cache',
    });
    expect('database' in layout.project.facts).toBe(false);
    expect('database' in layout.project.local).toBe(false);
    expect('identity' in layout.project.local).toBe(false);
    expect('settings' in layout.project.local).toBe(false);
    expect(layout.global.workspaceCaches).toBe('/Users/feng/.neko/workspace-cache');
    expect(resolveWorkspaceCachePartition('/Users/feng', WORKSPACE_ID)).toBe(
      `/Users/feng/.neko/workspace-cache/${WORKSPACE_ID}`,
    );
    expect(layout.global).toMatchObject({
      desktopLogs: '/Users/feng/.neko/logs/desktop',
      workspaceLogs: '/Users/feng/.neko/logs/workspaces',
      agentLogs: '/Users/feng/.neko/logs/agent',
    });
  });

  it('routes user-authored Agent content to canonical editable file roots', () => {
    const layout = resolveStorageLayout('/workspace/demo', '/Users/feng');

    expect(layout.global).toMatchObject({
      skills: '/Users/feng/.agents/skills',
      commands: '/Users/feng/.neko/commands',
      prompts: '/Users/feng/.neko/prompts',
      agentsMd: '/Users/feng/.neko/AGENTS.md',
      config: '/Users/feng/.neko/config.toml',
      processors: '/Users/feng/.neko/processors',
    });
    expect('config' in layout.project.facts).toBe(false);
  });

  it('resolves exact owner-partitioned managed log files', () => {
    expect(resolveManagedLogFile('/Users/feng', { kind: 'desktop' })).toBe(
      '/Users/feng/.neko/logs/desktop/desktop.ndjson',
    );
    expect(resolveManagedLogFile('/Users/feng', { kind: 'agent' })).toBe(
      '/Users/feng/.neko/logs/agent/agent.ndjson',
    );
    expect(
      resolveManagedLogFile('/Users/feng', {
        kind: 'workspace',
        workspaceId: WORKSPACE_ID,
      }),
    ).toBe(`/Users/feng/.neko/logs/workspaces/${WORKSPACE_ID}/workspace.ndjson`);
    expect(() =>
      resolveManagedLogFile('/Users/feng', { kind: 'workspace', workspaceId: '../escape' }),
    ).toThrow('valid workspaceId');
  });

  it('accepts only the canonical metadata database path', () => {
    expect(() =>
      assertCanonicalMetadataDatabasePath('/workspace/demo/neko/neko-cache.db', '/Users/feng'),
    ).toThrowError(expect.objectContaining({ code: 'unknown-managed-storage' }));
    expect(() =>
      assertCanonicalMetadataDatabasePath('/Users/feng/.neko/neko.db', '/Users/feng'),
    ).not.toThrow();
  });
});

describe('workspace identity', () => {
  it('atomically creates and then reuses the workspace identity descriptor', async () => {
    const workspaceRoot = '/workspace/demo';
    const descriptorPath = '/workspace/demo/neko/project.json';
    const files = new Map<string, string>();
    let nextWorkspaceId = WORKSPACE_ID;
    const filePort = {
      readFileIfExists: async (path: string) => files.get(path) ?? null,
      ensureParentDirectory: async () => undefined,
      writeFileExclusive: async (path: string, content: string) => {
        if (files.has(path)) return 'exists' as const;
        files.set(path, content);
        return 'written' as const;
      },
      createWorkspaceId: () => nextWorkspaceId,
    };

    await expect(ensureWorkspaceIdentityDescriptor(workspaceRoot, filePort)).resolves.toEqual({
      workspaceId: WORKSPACE_ID,
    });
    nextWorkspaceId = 'bd82b3ee-b9d9-4aa0-a635-23fa356e67df';
    await expect(ensureWorkspaceIdentityDescriptor(workspaceRoot, filePort)).resolves.toEqual({
      workspaceId: WORKSPACE_ID,
    });
    expect(files.get(descriptorPath)).toBe(
      `{
  "workspaceId": "${WORKSPACE_ID}"
}
`,
    );
  });

  it('parses the UUID descriptor and preserves unknown root metadata', () => {
    const descriptor = parseWorkspaceIdentityJson(
      JSON.stringify({ unexpectedField: 2, workspaceId: WORKSPACE_ID }),
    );

    expect(descriptor).toEqual({ unexpectedField: 2, workspaceId: WORKSPACE_ID });
    expect(serializeWorkspaceIdentityDescriptor(descriptor)).toBe(
      `{\n  "unexpectedField": 2,\n  "workspaceId": "${WORKSPACE_ID}"\n}\n`,
    );
  });

  it('rejects malformed JSON and invalid UUID descriptors', () => {
    expect(() => parseWorkspaceIdentityJson('')).toThrowError(
      expect.objectContaining({ code: 'invalid-workspace-identity' }),
    );
    expect(() =>
      parseWorkspaceIdentityJson(JSON.stringify({ workspaceId: 'current' })),
    ).toThrowError(expect.objectContaining({ code: 'invalid-workspace-identity' }));
  });

  it('accepts portable locators and rejects absolute identity', () => {
    expect(createWorkspacePortableLocator('${HOME}/Git/neko-test')).toEqual({
      kind: 'variable',
      value: '${HOME}/Git/neko-test',
    });
    expect(createWorkspacePortableLocator('projects/neko-test')).toEqual({
      kind: 'relative',
      value: 'projects/neko-test',
    });
    expect(() => createWorkspacePortableLocator('/Users/feng/Git/neko-test')).toThrowError(
      expect.objectContaining({ code: 'absolute-workspace-locator' }),
    );
  });

  it('preserves identity and locator history when a workspace moves', () => {
    const originalLocator = createWorkspacePortableLocator('${HOME}/Git/neko-test');
    const binding: WorkspaceIdentityBinding = {
      workspaceId: WORKSPACE_ID,
      currentLocator: originalLocator,
      locatorHistory: [originalLocator],
      lastSeenAt: '2026-07-12T00:00:00.000Z',
      orphanedAt: null,
    };
    const moved = updateWorkspaceIdentityBinding(
      binding,
      createWorkspacePortableLocator('${HOME}/Projects/neko-test'),
      '2026-07-13T00:00:00.000Z',
    );

    expect(moved.workspaceId).toBe(WORKSPACE_ID);
    expect(moved.locatorHistory).toHaveLength(2);
    expect(moved.orphanedAt).toBeNull();
    expect(markWorkspaceIdentityOrphaned(moved, '2026-08-13T00:00:00.000Z').orphanedAt).toBe(
      '2026-08-13T00:00:00.000Z',
    );
  });

  it('diagnoses a duplicated live checkout identity without merging it', () => {
    const diagnostic = diagnoseDuplicateWorkspaceIdentity([
      {
        workspaceId: WORKSPACE_ID,
        locator: createWorkspacePortableLocator('${HOME}/Git/neko-test'),
        status: 'live',
      },
      {
        workspaceId: WORKSPACE_ID,
        locator: createWorkspacePortableLocator('${HOME}/Projects/neko-test-copy'),
        status: 'live',
      },
    ]);

    expect(diagnostic).toMatchObject({ code: 'duplicate-workspace-identity' });
  });

  it('does not diagnose historical inactive locators as duplicates', () => {
    const diagnostic = diagnoseDuplicateWorkspaceIdentity([
      {
        workspaceId: WORKSPACE_ID,
        locator: createWorkspacePortableLocator('${HOME}/Git/neko-test'),
        status: 'inactive',
      },
      {
        workspaceId: WORKSPACE_ID,
        locator: createWorkspacePortableLocator('${HOME}/Projects/neko-test'),
        status: 'live',
      },
    ]);

    expect(diagnostic).toBeNull();
  });
});
