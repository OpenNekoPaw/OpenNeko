import { describe, expect, it, vi } from 'vitest';
import {
  applyCanvasAddSourceResult,
  createCanvasFilePickerAddSourceInput,
  createCanvasProjectSourceAddClient,
  createCanvasMediaAddSourceInput,
  getCanvasFilePickerDefaultName,
  hasCanvasExternalDropPayload,
  isDomNode,
  isNodeLibraryDragLeavingCanvas,
} from './useDragDrop';

describe('useDragDrop node-library drag helpers', () => {
  it('recognizes DOM-like nodes in the node test environment', () => {
    const nodeLike = { nodeType: 1 } as unknown as EventTarget;
    const eventTargetLike = {} as EventTarget;

    expect(isDomNode(nodeLike)).toBe(true);
    expect(isDomNode(eventTargetLike)).toBe(false);
    expect(isDomNode(null)).toBe(false);
  });

  it('keeps node-library drag feedback while moving inside the canvas', () => {
    const insideTarget = { nodeType: 1 } as unknown as Node;
    const canvasElement = {
      contains: (target: Node) => target === insideTarget,
    } as HTMLDivElement;

    expect(isNodeLibraryDragLeavingCanvas({ relatedTarget: insideTarget }, canvasElement)).toBe(
      false,
    );
    expect(isNodeLibraryDragLeavingCanvas({ relatedTarget: null }, canvasElement)).toBe(true);
    expect(
      isNodeLibraryDragLeavingCanvas(
        { relatedTarget: { nodeType: 1 } as unknown as EventTarget },
        canvasElement,
      ),
    ).toBe(true);
  });
});

describe('useDragDrop external payload detection', () => {
  it('detects file and URI drops as handled by the file drop path', () => {
    expect(
      hasCanvasExternalDropPayload({ types: ['Files'] as unknown as DataTransfer['types'] }),
    ).toBe(true);
    expect(
      hasCanvasExternalDropPayload({
        types: ['text/uri-list'] as unknown as DataTransfer['types'],
      }),
    ).toBe(true);
    expect(
      hasCanvasExternalDropPayload({ types: ['text/plain'] as unknown as DataTransfer['types'] }),
    ).toBe(true);
    expect(
      hasCanvasExternalDropPayload({
        types: ['application/json'] as unknown as DataTransfer['types'],
      }),
    ).toBe(true);
  });

  it('leaves empty cross-extension drops for the extension-host DnD fallback', () => {
    expect(hasCanvasExternalDropPayload({ types: [] as unknown as DataTransfer['types'] })).toBe(
      false,
    );
  });
});

describe('useDragDrop add-source contract', () => {
  it('builds canonical file-picker requests for Canvas node-library media adds', () => {
    const request = createCanvasFilePickerAddSourceInput('media', { x: 12, y: 34 });

    expect(request).toEqual(
      expect.objectContaining({
        kind: 'file-picker',
        formatId: 'nkc',
        browserFile: { name: 'media' },
        target: { role: 'media' },
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        ingestMode: 'link',
        metadata: expect.objectContaining({
          canvasAdd: true,
          canvasAssetKind: 'media',
          dropX: 12,
          dropY: 34,
          name: 'media',
        }),
      }),
    );
    expect(getCanvasFilePickerDefaultName('canvas-embed')).toBe('canvas.nkc');
  });

  it('applies the first canonical sourceAdded response without requiring a second add', async () => {
    const posted: unknown[] = [];
    const listeners = new Map<string, (event: MessageEvent) => void>();
    const previousWindow = globalThis.window;
    globalThis.window = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener as (event: MessageEvent) => void);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    } as unknown as Window & typeof globalThis;
    const vscode = {
      postMessage: vi.fn((message: unknown) => {
        posted.push(message);
      }),
      getState: vi.fn(),
      setState: vi.fn(),
    };
    try {
      const addMediaAt = vi.fn();
      const onDropAssets = vi.fn();
      const client = createCanvasProjectSourceAddClient(vscode);

      const promise = client.addSource({
        requestId: 'first-add',
        kind: 'drag-drop',
        formatId: 'nkc',
        sourceUri: 'file:///workspace/project/media/first.mp4',
        browserFile: { name: 'first.mp4' },
        target: { role: 'media' },
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        ingestMode: 'link',
        metadata: {
          canvasAdd: true,
          canvasAssetKind: 'media',
          mediaType: 'video',
          name: 'first.mp4',
        },
      });
      await Promise.resolve();

      expect(posted).toEqual([
        expect.objectContaining({
          type: 'project:addSource',
          request: expect.objectContaining({ requestId: 'first-add' }),
        }),
      ]);

      listeners.get('message')?.({
        data: {
          type: 'project:sourceAdded',
          result: {
            requestId: 'first-add',
            ok: true,
            durablePath: 'media/first.mp4',
            diagnostics: [],
            ingest: {
              status: 'ready',
              request: {
                mode: 'link',
                destination: { kind: 'project', directory: 'media', copyMode: 'link' },
              },
              source: { kind: 'file', path: 'media/first.mp4' },
              contractedPath: 'media/first.mp4',
              metadata: { canvasAssetKind: 'media', mediaType: 'video', name: 'first.mp4' },
            },
          },
        },
      } as MessageEvent);

      const result = await promise;
      applyCanvasAddSourceResult({
        result,
        sourceNameHint: 'first.mp4',
        mediaTypeHint: 'video',
        dropPosition: { x: 10, y: 20 },
        addMediaAt,
        onDropAssets,
      });

      expect(addMediaAt).not.toHaveBeenCalled();
      expect(onDropAssets).toHaveBeenCalledTimes(1);
      expect(onDropAssets).toHaveBeenCalledWith(
        [{ kind: 'media', path: 'media/first.mp4', name: 'first.mp4', mediaType: 'video' }],
        { x: 10, y: 20 },
      );
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it('builds create-asset requests for native media files without blob URLs', () => {
    const file = {
      name: 'clip.mp4',
      size: 1024,
      type: 'video/mp4',
      lastModified: 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File;

    const request = createCanvasMediaAddSourceInput({
      file,
      mediaType: 'video',
      dropPosition: { x: 12, y: 34 },
    });

    expect(request).toEqual(
      expect.objectContaining({
        kind: 'drag-drop',
        formatId: 'nkc',
        file,
        target: { role: 'media' },
        destination: { kind: 'project', directory: 'media', copyMode: 'copy' },
        ingestMode: 'create-asset',
        metadata: expect.objectContaining({
          canvasAdd: true,
          mediaType: 'video',
          dropX: 12,
          dropY: 34,
          name: 'clip.mp4',
        }),
      }),
    );
    expect(JSON.stringify(request)).not.toContain('blob:');
  });

  it('adds the first and second media assets only after durable source success', () => {
    const addMediaAt = vi.fn();
    const onDropAssets = vi.fn();

    applyCanvasAddSourceResult({
      result: {
        requestId: 'first',
        ok: true,
        durablePath: 'media/first.mp4',
        diagnostics: [],
        ingest: {
          status: 'ready',
          request: {
            mode: 'link',
            destination: { kind: 'project', directory: 'media', copyMode: 'link' },
          },
          source: { kind: 'file', path: 'media/first.mp4' },
          contractedPath: 'media/first.mp4',
          metadata: { canvasAssetKind: 'media', mediaType: 'video', name: 'first.mp4' },
        },
      },
      sourceNameHint: 'first.mp4',
      mediaTypeHint: 'video',
      dropPosition: { x: 10, y: 20 },
      addMediaAt,
      onDropAssets,
    });
    applyCanvasAddSourceResult({
      result: {
        requestId: 'second',
        ok: true,
        durablePath: 'media/second.mp4',
        diagnostics: [],
        ingest: {
          status: 'ready',
          request: {
            mode: 'link',
            destination: { kind: 'project', directory: 'media', copyMode: 'link' },
          },
          source: { kind: 'file', path: 'media/second.mp4' },
          contractedPath: 'media/second.mp4',
          metadata: { canvasAssetKind: 'media', mediaType: 'video', name: 'second.mp4' },
        },
      },
      sourceNameHint: 'second.mp4',
      mediaTypeHint: 'video',
      dropPosition: { x: 40, y: 50 },
      addMediaAt,
      onDropAssets,
    });

    expect(addMediaAt).not.toHaveBeenCalled();
    expect(onDropAssets).toHaveBeenNthCalledWith(
      1,
      [{ kind: 'media', path: 'media/first.mp4', name: 'first.mp4', mediaType: 'video' }],
      { x: 10, y: 20 },
    );
    expect(onDropAssets).toHaveBeenNthCalledWith(
      2,
      [{ kind: 'media', path: 'media/second.mp4', name: 'second.mp4', mediaType: 'video' }],
      { x: 40, y: 50 },
    );
  });

  it('leaves canvas data unchanged when add-source is rejected', () => {
    const addMediaAt = vi.fn();
    const onDropAssets = vi.fn();
    const onError = vi.fn();

    applyCanvasAddSourceResult({
      result: {
        requestId: 'rejected',
        ok: false,
        diagnostics: [
          {
            code: 'runtime-handle-persisted',
            severity: 'error',
            message: 'Runtime preview handles cannot be saved.',
          },
        ],
      },
      sourceNameHint: 'blob:vscode-runtime',
      mediaTypeHint: 'video',
      dropPosition: { x: 10, y: 20 },
      addMediaAt,
      onDropAssets,
      onError,
    });

    expect(addMediaAt).not.toHaveBeenCalled();
    expect(onDropAssets).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Runtime preview handles cannot be saved.');
  });
});
