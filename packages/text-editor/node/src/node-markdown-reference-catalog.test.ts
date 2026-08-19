import type { NekoHostPorts } from '@neko/host/ports';
import type { TextDocumentIdentity } from '@neko/text-editor-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const owners = vi.hoisted(() => ({
  workspaceFiles: vi.fn(),
  linkedMedia: vi.fn(),
  entities: vi.fn(),
}));

vi.mock('@neko/assets-node', () => ({
  searchWorkspaceContentEntries: owners.workspaceFiles,
  searchProjectMediaLibraryContentEntries: owners.linkedMedia,
}));
vi.mock('@neko/entity-node', () => ({ readProjectEntityResources: owners.entities }));

import { createNodeTextEditorMarkdownReferenceCatalog } from './node-markdown-reference-catalog';

const identity: TextDocumentIdentity = {
  owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
  workspaceId: 'workspace-1',
  documentId: 'notes/draft.md',
  locator: { file: { authority: 'workspace', path: 'notes/draft.md' } },
};
const workspace = {
  workspaceId: 'workspace-1',
  workspacePath: '/private/workspace',
  displayName: 'Workspace',
  locator: { kind: 'relative' as const, value: 'workspace' },
};

beforeEach(() => {
  owners.workspaceFiles.mockReset().mockResolvedValue([contentEntry('notes/story.md', 'story.md')]);
  owners.linkedMedia
    .mockReset()
    .mockResolvedValue([mediaContentEntry('Reference', 'cover.png', 'cover.png', 'image')]);
  owners.entities.mockReset().mockResolvedValue({
    entities: [
      {
        entityId: 'character-1',
        kind: 'character',
        names: { canonical: '小橘', aliases: ['橘子'] },
        representations: [],
        lifecycle: { state: 'active' },
        createdAt: '2026-08-09T00:00:00.000Z',
        updatedAt: '2026-08-09T00:00:00.000Z',
      },
    ],
    diagnostics: [],
  });
});

describe('Node Text Editor Markdown reference catalog', () => {
  it('projects exact owner results into portable candidates without exposing Host paths', async () => {
    const resolveWorkspace = vi.fn(async () => workspace);
    const catalog = createNodeTextEditorMarkdownReferenceCatalog({
      files: {} as NekoHostPorts['files'],
      globalMediaLibraryRoot: '/private/global-media-libraries',
      resolveWorkspace,
    });

    const mentionResult = await catalog.search(request('mention', '小'), active());
    expect(mentionResult).toMatchObject({
      status: 'ready',
      projection: {
        candidates: [{ source: 'entity', ref: { id: 'character-1' }, label: '小橘' }],
      },
    });
    expect(owners.workspaceFiles).not.toHaveBeenCalled();
    expect(owners.linkedMedia).not.toHaveBeenCalled();
    const embedResult = await catalog.search(request('resource-embed', 'cover'), active());
    expect(embedResult).toMatchObject({
      status: 'ready',
      projection: {
        candidates: [
          {
            source: 'asset',
            ref: { kind: 'workspace-file', id: 'neko/assets/Reference/cover.png' },
            target: 'neko/assets/Reference/cover.png',
            detail: 'neko/assets/Reference/cover.png',
            embeddable: true,
          },
        ],
      },
    });
    expect(resolveWorkspace).toHaveBeenCalledWith('workspace-1');
    expect(owners.workspaceFiles).toHaveBeenCalledWith(
      expect.objectContaining({ workspace, query: 'cover', limit: 20 }),
    );
    expect(JSON.stringify([mentionResult, embedResult])).not.toContain('/private/workspace');
  });

  it('contains a poisoned entity owner without falling back to files or linked media', async () => {
    owners.entities.mockRejectedValue(new Error('entity-store-unavailable'));
    const catalog = createNodeTextEditorMarkdownReferenceCatalog({
      files: {} as NekoHostPorts['files'],
      globalMediaLibraryRoot: '/private/global-media-libraries',
      resolveWorkspace: vi.fn(async () => workspace),
    });

    const result = await catalog.search(request('mention', ''), active());
    expect(result).toMatchObject({
      status: 'ready',
      projection: {
        candidates: [],
        diagnostics: [
          {
            code: 'text-editor-markdown-reference-contributor-failed',
            source: 'entity',
          },
        ],
      },
    });
    expect(owners.workspaceFiles).not.toHaveBeenCalled();
    expect(owners.linkedMedia).not.toHaveBeenCalled();
  });
});

function request(kind: 'mention' | 'resource-link' | 'resource-embed', query: string) {
  return {
    requestId: 'request-1',
    identity,
    sessionId: 'session-1',
    editSequence: 0,
    kind,
    query,
    limit: 20,
  };
}

function active() {
  return { signal: new AbortController().signal, isCurrent: () => true };
}

function contentEntry(path: string, label: string, mediaType: string = 'file') {
  return {
    locator: { file: { authority: 'workspace' as const, path } },
    label,
    description: 'Owning catalog description',
    availability: 'available' as const,
    capabilities: ['read' as const],
    metadata: { mediaType },
    role: 'content' as const,
    depth: 0,
  };
}

function mediaContentEntry(
  libraryName: string,
  relativePath: string,
  label: string,
  mediaType: string,
) {
  return {
    ...contentEntry('unused', label, mediaType),
    locator: {
      file: {
        authority: 'workspace' as const,
        path: `neko/assets/${libraryName}/${relativePath}`,
      },
    },
  };
}
