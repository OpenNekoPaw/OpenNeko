import { describe, expect, it } from 'vitest';
import { createVSCodeWorkspaceMediaPathContext } from '../workspace-media-path';

describe('createVSCodeWorkspaceMediaPathContext', () => {
  it('uses the containing workspace as the owning root', () => {
    const context = createVSCodeWorkspaceMediaPathContext({
      documentUri: uri('/work/b/story/canvas.nkc'),
      workspaceFolders: [folder('/work/a'), folder('/work/b')],
    });

    expect(context).toMatchObject({
      sourceDocumentUri: 'file:///work/b/story/canvas.nkc',
      owningWorkspaceRoot: '/work/b',
      workspaceRoots: ['/work/a', '/work/b'],
      documentDir: '/work/b/story',
      allowedRoots: ['/work/a', '/work/b'],
    });
    expect(context.pathVariables?.get('WORKSPACE')).toBe('/work/b');
    expect(context.pathVariables?.get('PROJECT')).toBe('/work/b');
  });

  it('chooses the longest containing workspace root', () => {
    const context = createVSCodeWorkspaceMediaPathContext({
      documentUri: uri('/work/a/sub/story/canvas.nkc'),
      workspaceFolders: [folder('/work/a'), folder('/work/a/sub')],
    });

    expect(context.owningWorkspaceRoot).toBe('/work/a/sub');
  });

  it('preserves custom variables while setting workspace variables', () => {
    const context = createVSCodeWorkspaceMediaPathContext({
      documentUri: uri('/work/a/story/canvas.nkc'),
      workspaceFolders: [folder('/work/a')],
      pathVariables: new Map([['MEDIA', '/Volumes/media']]),
    });

    expect(context.pathVariables?.get('MEDIA')).toBe('/Volumes/media');
    expect(context.pathVariables?.get('WORKSPACE')).toBe('/work/a');
  });
});

function uri(fsPath: string): {
  readonly scheme: string;
  readonly fsPath: string;
  toString(): string;
} {
  return {
    scheme: 'file',
    fsPath,
    toString: () => `file://${fsPath}`,
  };
}

function folder(fsPath: string): {
  readonly uri: { readonly fsPath: string };
} {
  return { uri: { fsPath } };
}
