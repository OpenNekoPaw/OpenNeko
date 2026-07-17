import { describe, expect, it } from 'vitest';
import {
  classifyWorkspaceMediaPath,
  contractWorkspaceMediaPath,
  createWorkspaceMediaPathCandidates,
  resolveWorkspaceMediaPath,
  type WorkspaceMediaPathContext,
} from '../workspace-media-path';

describe('workspace media path resolver', () => {
  const context: WorkspaceMediaPathContext = {
    sourceDocumentUri: 'file:///work/a/story/canvas.nkc',
    owningWorkspaceRoot: '/work/a',
    workspaceRoots: ['/work/a', '/work/b'],
    documentDir: '/work/a/story',
    pathVariables: new Map([
      ['WORKSPACE', '/work/a'],
      ['PROJECT', '/work/a'],
      ['MEDIA', '/Volumes/media'],
    ]),
    allowedRoots: ['/work/a', '/Volumes/media'],
  };

  it('classifies supported source forms', () => {
    expect(classifyWorkspaceMediaPath('cases/1080P.mp4')).toMatchObject({
      kind: 'workspace-relative',
    });
    expect(classifyWorkspaceMediaPath('${WORKSPACE}/cases/test.aac')).toMatchObject({
      kind: 'variable',
      variable: 'WORKSPACE',
    });
    expect(classifyWorkspaceMediaPath('/cases/test.mp4')).toMatchObject({
      kind: 'absolute-local',
    });
    expect(classifyWorkspaceMediaPath('/Volumes/media/test.mp4')).toMatchObject({
      kind: 'absolute-local',
    });
    expect(classifyWorkspaceMediaPath('https://example.test/a.mp4')).toMatchObject({
      kind: 'remote-url',
    });
  });

  it('plans plain relative paths from workspace roots', () => {
    const planned = createWorkspaceMediaPathCandidates('cases/1080P.mp4', context);

    expect(planned.candidates.map((candidate) => candidate.path)).toEqual([
      '/work/a/cases/1080P.mp4',
      '/work/b/cases/1080P.mp4',
    ]);
    expect(planned.candidates[0]).toMatchObject({
      reason: 'workspace-relative',
      root: '/work/a',
    });
  });

  it('resolves workspace-relative paths to existing local files', () => {
    const result = resolveWorkspaceMediaPath({
      source: 'cases/1080P.mp4',
      context,
      fileExists: (filePath) => filePath === '/work/a/cases/1080P.mp4',
      isPathAuthorized: (filePath) => filePath.startsWith('/work/a/'),
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/work/a/cases/1080P.mp4',
    });
  });

  it('resolves workspace variables through the owning workspace context', () => {
    const result = resolveWorkspaceMediaPath({
      source: '${WORKSPACE}/cases/test.aac',
      context,
      fileExists: (filePath) => filePath === '/work/a/cases/test.aac',
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/work/a/cases/test.aac',
    });
  });

  it('resolves project variables through the owning workspace context', () => {
    const result = resolveWorkspaceMediaPath({
      source: '${PROJECT}/cases/test.aac',
      context,
      fileExists: (filePath) => filePath === '/work/a/cases/test.aac',
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/work/a/cases/test.aac',
    });
  });

  it('resolves custom variables through the path variable map', () => {
    const result = resolveWorkspaceMediaPath({
      source: '${MEDIA}/music/theme.wav',
      context,
      fileExists: (filePath) => filePath === '/Volumes/media/music/theme.wav',
      isPathAuthorized: (filePath) => filePath.startsWith('/Volumes/media/'),
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/Volumes/media/music/theme.wav',
    });
  });

  it('reports unknown variables before engine calls', () => {
    const result = resolveWorkspaceMediaPath({
      source: '${MISSING}/clip.mp4',
      context,
      fileExists: () => false,
    });

    expect(result.status).toBe('unresolved');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('unknown-variable');
  });

  it('keeps remote urls as remote outcomes', () => {
    const result = resolveWorkspaceMediaPath({
      source: 'https://cdn.example.test/clip.mp4',
      context,
    });

    expect(result).toMatchObject({
      status: 'remote',
      url: 'https://cdn.example.test/clip.mp4',
    });
  });

  it('rejects old document-relative paths when no workspace candidate exists', () => {
    const result = resolveWorkspaceMediaPath({
      source: '../cases/test.mp4',
      context,
      fileExists: (filePath) => filePath === '/work/a/cases/test.mp4',
    });

    expect(result.status).toBe('unresolved');
    expect(result.candidates.map((candidate) => candidate.path)).toEqual(['/work/cases/test.mp4']);
  });

  it('treats slash-prefixed paths as absolute local paths only', () => {
    const result = resolveWorkspaceMediaPath({
      source: '/cases/test.mp4',
      context,
      fileExists: (filePath) => filePath === '/work/a/cases/test.mp4',
    });

    expect(result.status).toBe('unresolved');
    expect(result.candidates.map((candidate) => candidate.path)).toEqual(['/cases/test.mp4']);
  });

  it('preserves existing absolute files when they exist', () => {
    const result = resolveWorkspaceMediaPath({
      source: '/Volumes/media/test.mp4',
      context,
      fileExists: (filePath) => filePath === '/Volumes/media/test.mp4',
      isPathAuthorized: (filePath) => filePath.startsWith('/Volumes/media/'),
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/Volumes/media/test.mp4',
      candidate: { reason: 'absolute-local' },
    });
  });

  it('reports unauthorized resolved paths', () => {
    const result = resolveWorkspaceMediaPath({
      source: '${MEDIA}/music/theme.wav',
      context,
      fileExists: (filePath) => filePath === '/Volumes/media/music/theme.wav',
      isPathAuthorized: () => false,
    });

    expect(result).toMatchObject({
      status: 'unauthorized',
      path: '/Volumes/media/music/theme.wav',
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('unauthorized-path');
  });

  it('reports multi-root ambiguity while selecting the owning workspace first', () => {
    const result = resolveWorkspaceMediaPath({
      source: 'cases/clip.mp4',
      context,
      fileExists: (filePath) =>
        filePath === '/work/a/cases/clip.mp4' || filePath === '/work/b/cases/clip.mp4',
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/work/a/cases/clip.mp4',
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'multi-root-ambiguity',
    );
  });

  it('reports missing context for relative paths without roots', () => {
    const result = resolveWorkspaceMediaPath({
      source: 'cases/clip.mp4',
      context: {},
      fileExists: () => false,
    });

    expect(result.status).toBe('unresolved');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('missing-context');
  });

  it('contracts workspace files to plain relative paths', () => {
    const result = contractWorkspaceMediaPath('/work/a/cases/test.mp4', context);

    expect(result).toEqual({
      path: 'cases/test.mp4',
      format: 'workspace-relative',
      diagnostics: [],
    });
  });

  it('contracts external files to configured variables', () => {
    const result = contractWorkspaceMediaPath('/Volumes/media/music/theme.wav', context);

    expect(result).toEqual({
      path: '${MEDIA}/music/theme.wav',
      format: 'variable',
      diagnostics: [],
    });
  });
});
