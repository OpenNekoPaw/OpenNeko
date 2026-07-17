import { describe, expect, it } from 'vitest';
import {
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
} from '../file-access-policy';
import { parseGitignoreRules } from '../../../input/workspace-ignore';

describe('createWorkspaceFileAccessPolicy', () => {
  const workspaceRoot = '/workspace/project';

  it('resolves workspace-relative paths and separates read/write roots', () => {
    const policy = createWorkspaceFileAccessPolicy({
      workspaceRoot,
      readRoots: [workspaceRoot, '/library/media'],
      writeRoots: [workspaceRoot],
    });

    expect(policy.authorize('src/story.md', 'read')).toMatchObject({
      allowed: true,
      path: '/workspace/project/src/story.md',
    });
    expect(policy.authorize('/library/media/ref.png', 'read')).toMatchObject({
      allowed: true,
      path: '/library/media/ref.png',
    });
    expect(policy.authorize('/library/media/ref.png', 'write')).toMatchObject({
      allowed: false,
      reason: 'outside-authorized-roots',
    });
  });

  it('rejects system temp and user-special unmanaged paths before root authorization', () => {
    const policy = createWorkspaceFileAccessPolicy({
      workspaceRoot,
      readRoots: [workspaceRoot, '/tmp'],
    });

    expect(policy.authorize('/tmp/neko/page.png', 'read')).toMatchObject({
      allowed: false,
      reason: 'forbidden-unmanaged-path',
    });
    expect(
      policy.authorize('/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/neko/page.png', 'read'),
    ).toMatchObject({
      allowed: false,
      reason: 'forbidden-unmanaged-path',
    });
  });

  it('rejects managed workspace runtime directories by default', () => {
    const policy = createWorkspaceFileAccessPolicy({ workspaceRoot });

    expect(policy.authorize('.neko/.cache/resources/page.png', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
    });
    expect(policy.authorize('/workspace/project/.neko/logs/events.jsonl', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
    });
  });

  it('rejects managed cache roots even when callers try to expose them as ordinary paths', () => {
    const policy = createWorkspaceFileAccessPolicy({
      workspaceRoot,
    });

    expect(policy.authorize('.neko/.cache/resources/documents/page.png', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
    });
    expect(policy.authorize('.neko/.cache/generated/shot.png', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
    });
  });

  it('rejects workspace .gitignore matches', () => {
    const policy = createWorkspaceFileAccessPolicy({
      workspaceRoot,
      ignoreRules: { gitignoreRules: ['ignored/', '*.secret'] },
    });

    expect(policy.authorize('ignored/page.png', 'read')).toEqual({
      allowed: false,
      path: '/workspace/project/ignored/page.png',
      reason: 'ignored-workspace-path',
      rule: 'ignored/',
    });
    expect(policy.authorize('src/token.secret', 'read')).toEqual({
      allowed: false,
      path: '/workspace/project/src/token.secret',
      reason: 'ignored-workspace-path',
      rule: '*.secret',
    });
  });

  it('does not treat .gitignore negation rules as read re-authorization', () => {
    const policy = createWorkspaceFileAccessPolicy({
      workspaceRoot,
      ignoreRules: {
        gitignoreRules: parseGitignoreRules(`
generated/
!generated/keep.png
`),
      },
    });

    expect(policy.authorize('generated/keep.png', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
    });
  });
});

describe('createNoWorkspaceFileAccessPolicy', () => {
  it('fails closed without an authorized workspace', () => {
    const policy = createNoWorkspaceFileAccessPolicy();

    expect(policy.authorize('/workspace/project/src/story.md', 'read')).toEqual({
      allowed: false,
      path: '/workspace/project/src/story.md',
      reason: 'missing-authorized-root',
    });
  });
});
