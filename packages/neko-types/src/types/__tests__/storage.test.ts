import { describe, expect, it } from 'vitest';
import {
  assertCanonicalMetadataDatabasePath,
  createWorkspacePortableLocator,
  diagnoseDuplicateWorkspaceIdentity,
  diagnoseWorkspaceContentPlacement,
  ensureWorkspaceIdentityDescriptor,
  getNekoStorageClassification,
  listNekoStorageClassifications,
  markWorkspaceIdentityOrphaned,
  parseWorkspaceIdentityJson,
  resolveStorageLayout,
  serializeWorkspaceIdentityDescriptor,
  updateWorkspaceIdentityBinding,
  type WorkspaceIdentityBinding,
} from '../storage';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';

describe('storage classification', () => {
  it('classifies every canonical storage responsibility', () => {
    expect(listNekoStorageClassifications()).toHaveLength(11);
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
    expect(getNekoStorageClassification('conversation-journals')).toMatchObject({
      storageClass: 'raw-journal',
      durability: 'authoritative',
    });
  });

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
    expect(layout.project.local.workspaceIdentity).toBe('/workspace/demo/.neko/workspace.json');
    expect('database' in layout.project.local.cache).toBe(false);
  });

  it('diagnoses deprecated hooks and explicitly personal workspace content', () => {
    expect(
      diagnoseWorkspaceContentPlacement([
        {
          relativePath: '.neko/hooks/preflight.md',
          kind: 'hook',
          intendedScope: 'project',
        },
        {
          relativePath: '.neko/prompts/reviewer.md',
          kind: 'prompt',
          intendedScope: 'personal',
        },
        {
          relativePath: '.neko/prompts/project-review.md',
          kind: 'prompt',
          intendedScope: 'project',
        },
      ]),
    ).toEqual([
      {
        code: 'deprecated-hook-catalog',
        kind: 'hook',
        relativePath: '.neko/hooks/preflight.md',
        suggestedTarget: '.neko/settings.local.json',
        message:
          'Deprecated .neko/hooks content must be converted to settings-based hook configuration.',
      },
      {
        code: 'misplaced-personal-content',
        kind: 'prompt',
        relativePath: '.neko/prompts/reviewer.md',
        suggestedTarget: '~/.neko/prompts',
        message: 'Personal prompt content is misplaced in workspace-local storage.',
      },
    ]);
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
    expect(layout.project.local).toMatchObject({
      skills: '/workspace/demo/.agents/skills',
      commands: '/workspace/demo/.neko/commands',
      prompts: '/workspace/demo/.neko/prompts',
      agentsMd: '/workspace/demo/.neko/AGENTS.md',
      config: '/workspace/demo/.neko/config.toml',
      processors: '/workspace/demo/.neko/processors',
    });
    expect('config' in layout.project.facts).toBe(false);
  });

  it('poisons retired workspace and package-local database paths', () => {
    expect(() =>
      assertCanonicalMetadataDatabasePath(
        '/workspace/demo/.neko/.cache/neko-cache.db',
        '/Users/feng',
      ),
    ).toThrowError(expect.objectContaining({ code: 'retired-workspace-database' }));
    expect(() =>
      assertCanonicalMetadataDatabasePath('/Users/feng/.neko/neko.db', '/Users/feng'),
    ).not.toThrow();
  });
});

describe('workspace identity', () => {
  it('atomically creates and then reuses the workspace identity descriptor', async () => {
    const workspaceRoot = '/workspace/demo';
    const descriptorPath = '/workspace/demo/.neko/workspace.json';
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
      version: 1,
      workspaceId: WORKSPACE_ID,
    });
    nextWorkspaceId = 'bd82b3ee-b9d9-4aa0-a635-23fa356e67df';
    await expect(ensureWorkspaceIdentityDescriptor(workspaceRoot, filePort)).resolves.toEqual({
      version: 1,
      workspaceId: WORKSPACE_ID,
    });
    expect(files.get(descriptorPath)).toBe(
      `{
  "version": 1,
  "workspaceId": "${WORKSPACE_ID}"
}
`,
    );
  });

  it('parses and serializes the versioned UUID descriptor', () => {
    const descriptor = parseWorkspaceIdentityJson(
      JSON.stringify({ version: 1, workspaceId: WORKSPACE_ID }),
    );

    expect(descriptor).toEqual({ version: 1, workspaceId: WORKSPACE_ID });
    expect(serializeWorkspaceIdentityDescriptor(descriptor)).toBe(
      `{\n  "version": 1,\n  "workspaceId": "${WORKSPACE_ID}"\n}\n`,
    );
  });

  it('rejects malformed, unknown-version, and invalid UUID descriptors', () => {
    expect(() => parseWorkspaceIdentityJson('')).toThrowError(
      expect.objectContaining({ code: 'invalid-workspace-identity' }),
    );
    expect(() =>
      parseWorkspaceIdentityJson(JSON.stringify({ version: 2, workspaceId: WORKSPACE_ID })),
    ).toThrowError(expect.objectContaining({ code: 'workspace-identity-version-mismatch' }));
    expect(() =>
      parseWorkspaceIdentityJson(JSON.stringify({ version: 1, workspaceId: 'current' })),
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
