// @vitest-environment jsdom

import { act } from 'react';
import { createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CanvasHostRuntime,
  CanvasTextFilePreviewResult,
  FileCanvasNode,
} from '@neko/canvas-domain';
import { CanvasHostProvider, createCanvasWebviewHost } from '../../host-runtime';
import { FileNode } from './CanonicalContentNodes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'view-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'board.nkc',
  sessionId: 'session-1',
  rendererSessionId: 'renderer-1',
} as const;

describe('Canvas File node text preview', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('shows loading and then formatted JSON on the existing node surface', async () => {
    let resolvePreview = (_result: CanvasTextFilePreviewResult): void => {};
    const result = new Promise<CanvasTextFilePreviewResult>((resolve) => {
      resolvePreview = resolve;
    });
    const readTextFilePreview = vi.fn(() => result);
    const host = createCanvasWebviewHost(runtime(readTextFilePreview));
    const node = fileNode('file-json', 'data/project.json', 'application/json');

    await renderFile(root, host, node, true);
    expect(
      container.querySelector('.canvas-file-node')?.getAttribute('data-text-preview-status'),
    ).toBe('loading');

    await act(async () => {
      resolvePreview({
        requestId: 'canvas-webview-text-preview:1',
        nodeId: node.id,
        status: 'ready',
        kind: 'json',
        text: '{\n  "name": "OpenNeko"\n}',
        truncated: false,
        empty: false,
      });
      await result;
    });

    expect(
      container.querySelector('.canvas-file-node')?.getAttribute('data-text-preview-kind'),
    ).toBe('json');
    expect(container.querySelector('.canvas-file-node__format')?.textContent).toContain('JSON');
    expect(container.querySelector('.canvas-file-node__text')?.textContent).toContain(
      '"name": "OpenNeko"',
    );
    expect(container.querySelectorAll('.canvas-node-external-label')).toHaveLength(1);
    expect(container.querySelector('.canvas-node-external-label')?.textContent).toContain(
      'project.json',
    );
    expect(readTextFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        identity,
        nodeId: node.id,
        locator: node.data.contentLocator,
      }),
    );
  });

  it('renders Markdown read-only and keeps empty and diagnostic states visible', async () => {
    const markdownHost = createCanvasWebviewHost(
      runtime(async (request) => ({
        requestId: request.requestId,
        nodeId: request.nodeId,
        status: 'ready',
        kind: 'markdown',
        text: '# Heading\n\nBody',
        truncated: true,
        empty: false,
      })),
    );
    await renderFile(root, markdownHost, fileNode('file-md', 'notes/readme.md', 'text/markdown'));
    expect(container.querySelector('.canvas-file-node__markdown')?.textContent).toContain(
      'Heading',
    );
    expect(container.querySelector('.canvas-file-node__truncated')?.textContent).toContain(
      'Preview truncated',
    );
    expect(container.querySelector('.canvas-markdown-node__editor')).toBeNull();

    const emptyHost = createCanvasWebviewHost(
      runtime(async (request) => ({
        requestId: request.requestId,
        nodeId: request.nodeId,
        status: 'ready',
        kind: 'plain',
        text: '',
        truncated: false,
        empty: true,
      })),
    );
    await renderFile(root, emptyHost, fileNode('file-empty', 'notes/empty.txt', 'text/plain'));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Empty file');

    const errorHost = createCanvasWebviewHost(
      runtime(async (request) => ({
        requestId: request.requestId,
        nodeId: request.nodeId,
        status: 'unavailable',
        diagnostic: { code: 'canvas-text-preview-invalid-json' },
      })),
    );
    await renderFile(
      root,
      errorHost,
      fileNode('file-error', 'data/broken.json', 'application/json'),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Invalid JSON');
  });

  it('ignores an earlier response after the locator changes', async () => {
    const pending = new Map<string, (result: CanvasTextFilePreviewResult) => void>();
    const host = createCanvasWebviewHost(
      runtime(
        (request) =>
          new Promise<CanvasTextFilePreviewResult>((resolve) => {
            pending.set(
              request.nodeId + ':' + request.locator.kind + ':' + request.requestId,
              resolve,
            );
          }),
      ),
    );
    const first = fileNode('file-json', 'data/first.json', 'application/json');
    await renderFile(root, host, first);
    const firstResolve = [...pending.values()][0];
    if (!firstResolve) throw new Error('First preview request was not started.');

    const second = {
      ...first,
      data: {
        ...first.data,
        path: 'data/second.json',
        title: 'second.json',
        contentLocator: { kind: 'workspace-file' as const, path: 'data/second.json' },
      },
    };
    await renderFile(root, host, second);
    const secondResolve = [...pending.values()][1];
    if (!secondResolve) throw new Error('Second preview request was not started.');
    await act(async () => {
      secondResolve({
        requestId: 'canvas-webview-text-preview:2',
        nodeId: second.id,
        status: 'ready',
        kind: 'json',
        text: '{\n  "source": "second"\n}',
        truncated: false,
        empty: false,
      });
      await Promise.resolve();
    });
    await act(async () => {
      firstResolve({
        requestId: 'canvas-webview-text-preview:1',
        nodeId: first.id,
        status: 'ready',
        kind: 'json',
        text: '{\n  "source": "first"\n}',
        truncated: false,
        empty: false,
      });
      await Promise.resolve();
    });
    expect(container.querySelector('.canvas-file-node__text')?.textContent).toContain('second');
    expect(container.querySelector('.canvas-file-node__text')?.textContent).not.toContain('first');
  });

  it('isolates a failed sibling and keeps unsupported files on the generic icon', async () => {
    const readTextFilePreview = vi.fn(async (request) => {
      if (request.nodeId === 'file-error') {
        return {
          requestId: request.requestId,
          nodeId: request.nodeId,
          status: 'unavailable' as const,
          diagnostic: { code: 'canvas-text-preview-unauthorized' as const },
        };
      }
      return {
        requestId: request.requestId,
        nodeId: request.nodeId,
        status: 'ready' as const,
        kind: 'plain' as const,
        text: 'first line\nsecond line',
        truncated: false,
        empty: false,
      };
    });
    const host = createCanvasWebviewHost(runtime(readTextFilePreview));
    const error = fileNode('file-error', 'notes/private.txt', 'text/plain');
    const ready = fileNode('file-ready', 'notes/readme.txt', 'text/plain');
    const binary = fileNode('file-binary', 'media/archive.bin', 'application/octet-stream');

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host}>
          <FileNode
            node={error}
            isSelected={false}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            containerRef={createRef<HTMLElement>()}
          />
          <FileNode
            node={ready}
            isSelected={false}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            containerRef={createRef<HTMLElement>()}
          />
          <FileNode
            node={binary}
            isSelected={false}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            containerRef={createRef<HTMLElement>()}
          />
        </CanvasHostProvider>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('File access denied');
    expect(container.textContent).toContain('first line');
    expect(container.querySelector('[data-text-preview-kind="plain"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-text-preview-status]')).toHaveLength(2);
    expect(readTextFilePreview).toHaveBeenCalledTimes(2);
  });
});

async function renderFile(
  root: Root,
  host: ReturnType<typeof createCanvasWebviewHost>,
  node: FileCanvasNode,
  isSelected = false,
): Promise<void> {
  await act(async () => {
    root.render(
      <CanvasHostProvider host={host}>
        <FileNode
          node={node}
          isSelected={isSelected}
          viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
          containerRef={createRef<HTMLElement>()}
        />
      </CanvasHostProvider>,
    );
    await Promise.resolve();
  });
}

function runtime(readTextFilePreview: CanvasHostRuntime['readTextFilePreview']): CanvasHostRuntime {
  return {
    identity,
    getSnapshot: async () => {
      throw new Error('Snapshot is not used by this component test.');
    },
    resolveMaterialActions: async () => {
      throw new Error('Material actions are not used by this component test.');
    },
    readTextFilePreview,
    subscribe: () => () => undefined,
    executeIntent: async () => {
      throw new Error('Intents are not used by this component test.');
    },
  };
}

function fileNode(id: string, path: string, mediaType: string): FileCanvasNode {
  return {
    id,
    type: 'file',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 180 },
    zIndex: 1,
    data: {
      path,
      title: path.split('/').at(-1) ?? path,
      mediaType,
      contentLocator: { kind: 'workspace-file', path },
    },
  };
}
