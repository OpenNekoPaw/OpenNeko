import { describe, expect, it, vi } from 'vitest';
import { CONTENT_LOCATOR_DRAG_MIME } from '@neko/content';
import {
  applyCanvasAddSourceResult,
  createCanvasFilePickerAddSourceInput,
  createCanvasProjectSourceAddClient,
  createCanvasMediaAddSourceInput,
  getCanvasFilePickerDefaultName,
  hasCanvasExternalDropPayload,
} from './useDragDrop';

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
    expect(
      hasCanvasExternalDropPayload({
        types: [CONTENT_LOCATOR_DRAG_MIME] as unknown as DataTransfer['types'],
      }),
    ).toBe(true);
  });

  it('leaves empty cross-surface drops for the Desktop host DnD path', () => {
    expect(hasCanvasExternalDropPayload({ types: [] as unknown as DataTransfer['types'] })).toBe(
      false,
    );
  });
});

describe('useDragDrop add-source contract', () => {
  it('builds canonical file-picker requests for Canvas media add actions', () => {
    const request = createCanvasFilePickerAddSourceInput('media', { x: 12, y: 34 });

    expect(request).toEqual(
      expect.objectContaining({
        kind: 'file-picker',
        formatId: 'nkc',
        browserFile: { name: 'media' },
        target: { role: 'media' },
        assetDirectory: 'media',
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
    expect(getCanvasFilePickerDefaultName('file')).toBe('file');

    const fileRequest = createCanvasFilePickerAddSourceInput('file', { x: 1, y: 2 });
    expect(fileRequest).toEqual(
      expect.objectContaining({
        browserFile: { name: 'file' },
        target: { role: 'document' },
        metadata: expect.objectContaining({
          canvasAssetKind: 'file',
        }),
      }),
    );
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
    const hostPort = {
      postMessage: vi.fn((message: unknown) => {
        posted.push(message);
      }),
      getState: vi.fn(),
      setState: vi.fn(),
    };
    try {
      const addMediaAt = vi.fn();
      const onDropAssets = vi.fn();
      const client = createCanvasProjectSourceAddClient(hostPort);

      const promise = client.addSource({
        requestId: 'first-add',
        kind: 'drag-drop',
        formatId: 'nkc',
        sourceUri: 'file:///workspace/project/media/first.mp4',
        browserFile: { name: 'first.mp4' },
        target: { role: 'media' },
        assetDirectory: 'media',
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
            contentLocator: { file: { authority: 'workspace', path: 'media/first.mp4' } },
            diagnostics: [],
            metadata: { canvasAssetKind: 'media', mediaType: 'video', name: 'first.mp4' },
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
        [
          {
            kind: 'media',
            path: 'media/first.mp4',
            name: 'first.mp4',
            mediaType: 'video',
            contentLocator: { file: { authority: 'workspace', path: 'media/first.mp4' } },
          },
        ],
        { x: 10, y: 20 },
      );
    } finally {
      globalThis.window = previousWindow;
    }
  });

  it('creates one typed text snapshot asset from Markdown and Fountain add-source results', () => {
    const addMediaAt = vi.fn();
    const onDropAssets = vi.fn();

    for (const [name, format, content] of [
      ['notes.md', 'markdown', '# Notes'],
      ['pilot.fountain', 'plain', 'INT. ROOM - DAY'],
    ] as const) {
      applyCanvasAddSourceResult({
        result: {
          requestId: `add-${name}`,
          ok: true,
          durablePath: `assets/${name}`,
          contentLocator: { file: { authority: 'workspace', path: `assets/${name}` } },
          diagnostics: [],
          metadata: {
            canvasAssetKind: 'text',
            name,
            title: name.replace(/\.[^.]+$/, ''),
            textFormat: format,
            textContent: content,
          },
        },
        sourceNameHint: name,
        dropPosition: { x: 10, y: 20 },
        addMediaAt,
        onDropAssets,
      });
    }

    expect(addMediaAt).not.toHaveBeenCalled();
    expect(onDropAssets).toHaveBeenNthCalledWith(
      1,
      [
        {
          kind: 'text',
          path: 'assets/notes.md',
          name: 'notes.md',
          title: 'notes',
          format: 'markdown',
          content: '# Notes',
        },
      ],
      { x: 10, y: 20 },
    );
    expect(onDropAssets).toHaveBeenNthCalledWith(
      2,
      [
        {
          kind: 'text',
          path: 'assets/pilot.fountain',
          name: 'pilot.fountain',
          title: 'pilot',
          format: 'plain',
          content: 'INT. ROOM - DAY',
        },
      ],
      { x: 10, y: 20 },
    );
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
        assetDirectory: 'media',
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

  it('projects intrinsic image dimensions through add-source without persisting image bytes', () => {
    const file = {
      name: 'portrait.png',
      size: 24,
      type: 'image/png',
      lastModified: 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File;
    const bytes = new Uint8Array([1, 2, 3]);
    const request = createCanvasMediaAddSourceInput({
      file,
      bytes,
      mediaType: 'image',
      dropPosition: { x: 12, y: 34 },
      intrinsicDimensions: { width: 800, height: 1200 },
    });

    expect(request.bytes).toBe(bytes);
    expect(request.metadata).toMatchObject({ intrinsicWidth: 800, intrinsicHeight: 1200 });

    const onDropAssets = vi.fn();
    applyCanvasAddSourceResult({
      result: {
        requestId: 'portrait',
        ok: true,
        durablePath: 'media/portrait.png',
        contentLocator: { file: { authority: 'workspace', path: 'media/portrait.png' } },
        diagnostics: [],
        metadata: request.metadata,
      },
      sourceNameHint: 'portrait.png',
      mediaTypeHint: 'image',
      dropPosition: { x: 12, y: 34 },
      addMediaAt: vi.fn(),
      onDropAssets,
    });

    expect(onDropAssets).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          kind: 'media',
          intrinsicDimensions: { width: 800, height: 1200 },
        }),
      ],
      { x: 12, y: 34 },
    );
  });

  it('adds the first and second media assets only after durable source success', () => {
    const addMediaAt = vi.fn();
    const onDropAssets = vi.fn();

    applyCanvasAddSourceResult({
      result: {
        requestId: 'first',
        ok: true,
        durablePath: 'media/first.mp4',
        contentLocator: { file: { authority: 'workspace', path: 'media/first.mp4' } },
        diagnostics: [],
        metadata: { canvasAssetKind: 'media', mediaType: 'video', name: 'first.mp4' },
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
        contentLocator: { file: { authority: 'workspace', path: 'media/second.mp4' } },
        diagnostics: [],
        metadata: { canvasAssetKind: 'media', mediaType: 'video', name: 'second.mp4' },
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
      [
        {
          kind: 'media',
          path: 'media/first.mp4',
          name: 'first.mp4',
          mediaType: 'video',
          contentLocator: { file: { authority: 'workspace', path: 'media/first.mp4' } },
        },
      ],
      { x: 10, y: 20 },
    );
    expect(onDropAssets).toHaveBeenNthCalledWith(
      2,
      [
        {
          kind: 'media',
          path: 'media/second.mp4',
          name: 'second.mp4',
          mediaType: 'video',
          contentLocator: { file: { authority: 'workspace', path: 'media/second.mp4' } },
        },
      ],
      { x: 40, y: 50 },
    );
  });

  it('rejects a path-only successful source response without creating a Canvas node', () => {
    const addMediaAt = vi.fn();
    const onDropAssets = vi.fn();
    const onError = vi.fn();

    applyCanvasAddSourceResult({
      result: {
        requestId: 'missing-locator',
        ok: true,
        durablePath: 'media/path-only.mp4',
        diagnostics: [],
        metadata: {
          canvasAssetKind: 'media',
          mediaType: 'video',
          name: 'path-only.mp4',
        },
      },
      sourceNameHint: 'path-only.mp4',
      mediaTypeHint: 'video',
      dropPosition: { x: 10, y: 20 },
      addMediaAt,
      onDropAssets,
      onError,
    });

    expect(addMediaAt).not.toHaveBeenCalled();
    expect(onDropAssets).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'Canvas source Host result omitted its canonical ContentLocator.',
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
      sourceNameHint: 'blob:hostPort-runtime',
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
