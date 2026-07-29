import { describe, expect, it } from 'vitest';
import { resolveWorkspaceMediaPath, type WorkspaceMediaPathContext } from '@neko/shared';

describe('Canvas workspace media path contract', () => {
  const context: WorkspaceMediaPathContext = {
    sourceDocumentUri: 'file:///workspace/story/canvas.nkc',
    owningWorkspaceRoot: '/workspace',
    workspaceRoots: ['/workspace', '/other-workspace'],
    documentDir: '/workspace/story',
    pathVariables: new Map([
      ['WORKSPACE', '/workspace'],
      ['PROJECT', '/workspace'],
    ]),
    allowedRoots: ['/workspace', '/other-workspace'],
  };

  it('resolves reopened workspace-relative Canvas media', () => {
    const result = resolveWorkspaceMediaPath({
      source: 'cases/1080P.mp4',
      context,
      fileExists: (filePath) => filePath === '/workspace/cases/1080P.mp4',
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/workspace/cases/1080P.mp4',
    });
  });

  it('resolves workspace variable Canvas media through the source workspace', () => {
    const result = resolveWorkspaceMediaPath({
      source: '${WORKSPACE}/cases/test.aac',
      context,
      fileExists: (filePath) => filePath === '/workspace/cases/test.aac',
    });

    expect(result).toMatchObject({
      status: 'resolved-local',
      path: '/workspace/cases/test.aac',
    });
  });

  it('treats slash-prefixed Canvas media as absolute local paths only', () => {
    const result = resolveWorkspaceMediaPath({
      source: '/cases/test.mp4',
      context,
      fileExists: (filePath) => filePath === '/workspace/cases/test.mp4',
    });

    expect(result.status).toBe('unresolved');
    expect(result.candidates.map((candidate) => candidate.path)).toEqual(['/cases/test.mp4']);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('missing-file');
  });

  it('does not recover slash-prefixed document-relative Canvas media as a legacy fallback', () => {
    const result = resolveWorkspaceMediaPath({
      source: '/../cases/test.mp4',
      context,
      fileExists: (filePath) => filePath === '/workspace/cases/test.mp4',
    });

    expect(result.status).toBe('unresolved');
    expect(result.candidates.map((candidate) => candidate.path)).toEqual(['/../cases/test.mp4']);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('missing-file');
  });

  it('reports missing media without fabricating an engine path', () => {
    const result = resolveWorkspaceMediaPath({
      source: 'cases/missing.mp4',
      context,
      fileExists: () => false,
    });

    expect(result.status).toBe('unresolved');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('missing-file');
  });
});
