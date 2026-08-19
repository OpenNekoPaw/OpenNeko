import { describe, expect, it } from 'vitest';
import {
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
} from '../file-access-policy';
import { parseGitignoreRules } from '../../../input/workspace-ignore';

describe('createWorkspaceFileAccessPolicy', () => {
  const workspaceRoot = '/workspace/project';
  const windowsRoot = 'C:\\workspace\\project';

  it('resolves normalized Workspace-relative paths inside the exact Workspace root', () => {
    const policy = createWorkspaceFileAccessPolicy({ workspaceRoot });

    expect(policy.authorize('src/story.md', 'read')).toEqual({
      allowed: true,
      hostPath: '/workspace/project/src/story.md',
      workspacePath: 'src/story.md',
      contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.md' } },
    });
    expect(policy.authorize('.', 'list')).toEqual({
      allowed: true,
      hostPath: '/workspace/project',
      workspacePath: '.',
    });
  });

  it('accepts an absolute POSIX path inside the exact Workspace root and canonicalizes it', () => {
    const policy = createWorkspaceFileAccessPolicy({ workspaceRoot });

    expect(policy.authorize('/workspace/project/src/story.md', 'read')).toEqual({
      allowed: true,
      hostPath: '/workspace/project/src/story.md',
      workspacePath: 'src/story.md',
      contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.md' } },
    });
    expect(policy.authorize('/workspace/project/.runtime/logs/events.jsonl', 'read')).toMatchObject(
      {
        allowed: false,
        reason: 'ignored-workspace-path',
        displayPath: '.runtime/logs/events.jsonl',
      },
    );
  });

  it('accepts absolute Windows paths inside a Windows Workspace root and canonicalizes them', () => {
    const policy = createWorkspaceFileAccessPolicy({ workspaceRoot: windowsRoot });

    expect(policy.authorize('src/story.md', 'read')).toEqual({
      allowed: true,
      hostPath: 'C:\\workspace\\project\\src\\story.md',
      workspacePath: 'src/story.md',
      contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.md' } },
    });
    expect(policy.authorize('C:\\workspace\\project\\src\\story.md', 'read')).toEqual({
      allowed: true,
      hostPath: 'C:\\workspace\\project\\src\\story.md',
      workspacePath: 'src/story.md',
      contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.md' } },
    });
    expect(policy.authorize('C:/workspace/project/src/story.md', 'read')).toEqual({
      allowed: true,
      hostPath: 'C:\\workspace\\project\\src\\story.md',
      workspacePath: 'src/story.md',
      contentLocator: { file: { authority: 'workspace' as const, path: 'src/story.md' } },
    });
  });

  it('rejects absolute paths outside the exact Workspace authority without leaking host paths', () => {
    const policy = createWorkspaceFileAccessPolicy({ workspaceRoot });

    expect(policy.authorize('/outside/secret.md', 'read')).toMatchObject({
      allowed: false,
      reason: 'outside-authorized-roots',
      displayPath: '(absolute path omitted)',
    });
    expect(policy.authorize('C:\\outside\\secret.md', 'read')).toMatchObject({
      allowed: false,
      reason: 'outside-authorized-roots',
      displayPath: '(absolute path omitted)',
    });
    const windowsPolicy = createWorkspaceFileAccessPolicy({ workspaceRoot: windowsRoot });
    expect(windowsPolicy.authorize('D:\\workspace\\secret.md', 'read')).toMatchObject({
      allowed: false,
      reason: 'outside-authorized-roots',
      displayPath: '(absolute path omitted)',
    });
  });

  it('rejects non-canonical relative model paths', () => {
    const policy = createWorkspaceFileAccessPolicy({ workspaceRoot });

    for (const filePath of [
      '',
      './src/story.md',
      'src/../story.md',
      'src//story.md',
      'src\\story.md',
      'src/',
      'src/./story.md',
    ]) {
      expect(policy.authorize(filePath, 'read')).toMatchObject({
        allowed: false,
        reason: 'invalid-workspace-relative-path',
      });
    }
  });

  it('preserves managed runtime, gitignore, and protected-document decisions for both path forms', () => {
    const policy = createWorkspaceFileAccessPolicy({
      workspaceRoot,
      ignoreRules: { gitignoreRules: ['ignored/', '*.secret'] },
    });

    expect(policy.authorize('ignored/page.png', 'read')).toEqual({
      allowed: false,
      path: '/workspace/project/ignored/page.png',
      displayPath: 'ignored/page.png',
      reason: 'ignored-workspace-path',
      rule: 'ignored/',
    });
    expect(policy.authorize('/workspace/project/ignored/page.png', 'read')).toEqual({
      allowed: false,
      path: '/workspace/project/ignored/page.png',
      displayPath: 'ignored/page.png',
      reason: 'ignored-workspace-path',
      rule: 'ignored/',
    });
    expect(policy.authorize('src/token.secret', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
      rule: '*.secret',
    });
    expect(policy.authorize('boards/story.NKC', 'read')).toMatchObject({
      allowed: false,
      reason: 'protected-project-document',
      protectedProjectOwner: 'canvas',
    });
    expect(policy.authorize('/workspace/project/timeline/edit.otio', 'write')).toMatchObject({
      allowed: false,
      reason: 'protected-project-document',
      protectedProjectOwner: 'cut',
    });
    expect(policy.authorize('/workspace/project/boards/story.nkc', 'list')).toMatchObject({
      allowed: true,
      workspacePath: 'boards/story.nkc',
      contentLocator: { file: { authority: 'workspace' as const, path: 'boards/story.nkc' } },
    });
    expect(policy.authorize('notes/project.nkc.md', 'read')).toMatchObject({
      allowed: true,
      contentLocator: { file: { authority: 'workspace' as const, path: 'notes/project.nkc.md' } },
    });
  });

  it('rejects managed cache roots even when callers try to expose them as ordinary paths', () => {
    const policy = createWorkspaceFileAccessPolicy({ workspaceRoot });

    expect(policy.authorize('.runtime/cache/resources/documents/page.png', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
    });
    expect(policy.authorize('.runtime/cache/generated/shot.png', 'read')).toMatchObject({
      allowed: false,
      reason: 'ignored-workspace-path',
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
      displayPath: '(path omitted)',
      reason: 'missing-authorized-root',
    });
  });
});
