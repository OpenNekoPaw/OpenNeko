import { describe, expect, it, vi } from 'vitest';
import type { ProjectSourceAddResult } from '../ingest';
import {
  createProjectSourceAddClient,
  createProjectSourceAddRequest,
  handleProjectSourceAddHostRequest,
  isProjectSourceAddResponseMessage,
  normalizeProjectSourceAddBytes,
  postProjectSourceAddResult,
  validateProjectSourceAddRequest,
  type ProjectSourceAddRequestMessage,
  type ProjectSourceAddResponseMessage,
} from '../index';

describe('Project source add Webview client', () => {
  it('posts add-source requests and resolves matching successful results', async () => {
    const listeners = new Set<(message: unknown) => void>();
    const posted: ProjectSourceAddRequestMessage[] = [];
    const client = createProjectSourceAddClient({
      createRequestId: () => 'add-1',
      postMessage: (message) => {
        posted.push(message);
      },
      addMessageListener: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setTimer: () => 'timer',
      clearTimer: vi.fn(),
    });

    const promise = client.addSource({
      kind: 'drag-drop',
      formatId: 'nkv',
      sourcePath: '/workspace/project/media/clip.mp4',
      destination: { kind: 'project', directory: 'media', copyMode: 'link' },
      ingestMode: 'link',
    });
    await Promise.resolve();

    expect(posted).toHaveLength(1);
    const response: ProjectSourceAddResponseMessage = {
      type: 'project:sourceAdded',
      result: {
        requestId: 'add-1',
        ok: true,
        durablePath: 'media/clip.mp4',
        diagnostics: [],
      },
    };
    listeners.forEach((listener) =>
      listener({ type: 'project:sourceAdded', result: { requestId: 'other' } }),
    );
    listeners.forEach((listener) => listener(response));

    await expect(promise).resolves.toEqual(response.result);
    expect(listeners.size).toBe(0);
  });

  it('resolves rejected results without mutating caller state', async () => {
    const listeners = new Set<(message: unknown) => void>();
    const client = createProjectSourceAddClient({
      createRequestId: () => 'add-rejected',
      postMessage: vi.fn(),
      addMessageListener: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setTimer: () => 'timer',
      clearTimer: vi.fn(),
    });

    const promise = client.addSource({
      kind: 'drag-drop',
      formatId: 'nkc',
      browserFile: { name: 'clip.mp4' },
      destination: { kind: 'project', directory: 'media', copyMode: 'copy' },
      ingestMode: 'create-asset',
    });
    await Promise.resolve();

    const rejected: ProjectSourceAddResult = {
      requestId: 'add-rejected',
      ok: false,
      diagnostics: [
        {
          code: 'missing-source',
          severity: 'error',
          message: 'No durable source.',
        },
      ],
    };
    listeners.forEach((listener) => listener({ type: 'project:sourceRejected', result: rejected }));

    await expect(promise).resolves.toEqual(rejected);
  });

  it('times out with diagnostics when no matching result arrives', async () => {
    let timeoutCallback: (() => void) | undefined;
    const client = createProjectSourceAddClient({
      createRequestId: () => 'add-timeout',
      postMessage: vi.fn(),
      addMessageListener: () => vi.fn(),
      setTimer: (callback) => {
        timeoutCallback = callback;
        return 'timer';
      },
      clearTimer: vi.fn(),
    });

    const promise = client.addSource({
      kind: 'drag-drop',
      formatId: 'nkv',
      browserFile: { name: 'clip.mp4' },
      destination: { kind: 'project', directory: 'media', copyMode: 'copy' },
      ingestMode: 'create-asset',
    });
    await Promise.resolve();
    timeoutCallback?.();

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        requestId: 'add-timeout',
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'add-source-timeout' })],
      }),
    );
  });

  it('creates browser file metadata and bytes for create-asset requests', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const request = await createProjectSourceAddRequest(
      {
        kind: 'drag-drop',
        formatId: 'nkc',
        file: {
          name: 'clip.mp4',
          type: 'video/mp4',
          size: bytes.byteLength,
          lastModified: 12,
          arrayBuffer: async () => bytes.buffer.slice(0),
        },
        destination: { kind: 'project', directory: 'media', copyMode: 'copy' },
        ingestMode: 'create-asset',
      },
      'add-file',
    );

    expect(request).toEqual(
      expect.objectContaining({
        requestId: 'add-file',
        browserFile: {
          name: 'clip.mp4',
          type: 'video/mp4',
          size: 3,
          lastModified: 12,
        },
        bytes,
      }),
    );
  });

  it('normalizes message-boundary bytes', () => {
    expect(normalizeProjectSourceAddBytes([1, 2, 3])).toEqual(new Uint8Array([1, 2, 3]));
    expect(normalizeProjectSourceAddBytes(new Uint8Array([4, 5]))).toEqual(new Uint8Array([4, 5]));
  });

  it('identifies canonical add-source response messages', () => {
    expect(
      isProjectSourceAddResponseMessage({
        type: 'project:sourceRejected',
        result: { requestId: 'add-1', ok: false, diagnostics: [] },
      }),
    ).toBe(true);
    expect(isProjectSourceAddResponseMessage({ type: 'project:sourceRejected' })).toBe(false);
  });

  it('allows file-picker requests to defer source selection to Extension Host', () => {
    expect(
      validateProjectSourceAddRequest({
        requestId: 'picker-1',
        kind: 'file-picker',
        formatId: 'nkv',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        ingestMode: 'link',
      }),
    ).toEqual([]);

    expect(
      validateProjectSourceAddRequest({
        requestId: 'drag-1',
        kind: 'drag-drop',
        formatId: 'nkv',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        ingestMode: 'link',
      }),
    ).toEqual([expect.objectContaining({ code: 'missing-source' })]);
  });
});

describe('Project source add Extension Host adapter', () => {
  it('posts successful link results through the canonical added message', async () => {
    const posted: ProjectSourceAddResponseMessage[] = [];
    const result = await handleProjectSourceAddHostRequest(
      {
        requestId: 'link-1',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/workspace/project/media/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
      },
      {
        postMessage: (message) => posted.push(message),
        ingestPort: {
          ingest: async (request) => ({
            status: 'ready',
            request,
            source: { kind: 'file', path: 'media/clip.mp4' },
            contractedPath: 'media/clip.mp4',
          }),
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        requestId: 'link-1',
        ok: true,
        durablePath: 'media/clip.mp4',
      }),
    );
    expect(posted).toEqual([{ type: 'project:sourceAdded', result }]);
  });

  it('posts byte create-asset results with durable output paths', async () => {
    const posted: ProjectSourceAddResponseMessage[] = [];
    const bytes = new Uint8Array([7, 8]);
    const result = await handleProjectSourceAddHostRequest(
      {
        requestId: 'asset-1',
        kind: 'drag-drop',
        formatId: 'nkc',
        bytes,
        browserFile: { name: 'clip.mp4', type: 'video/mp4' },
        destination: { kind: 'project', directory: 'media', copyMode: 'copy' },
        ingestMode: 'create-asset',
      },
      {
        postMessage: (message) => posted.push(message),
        ingestPort: {
          ingest: async (request) => ({
            status: 'ready',
            request,
            source: { kind: 'file', path: 'media/clip.mp4' },
            outputPath: '/workspace/project/media/clip.mp4',
          }),
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.durablePath).toBe('media/clip.mp4');
    expect(posted[0]?.type).toBe('project:sourceAdded');
  });

  it('posts unmanaged source rejection with diagnostics', async () => {
    const posted: ProjectSourceAddResponseMessage[] = [];
    const result = await handleProjectSourceAddHostRequest(
      {
        requestId: 'external-1',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/Downloads/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
        ingestMode: 'link',
      },
      {
        postMessage: (message) => posted.push(message),
        ingestPort: {
          ingest: async (request) => ({
            status: 'non-portable',
            request,
            error: 'Move this file into the workspace first.',
          }),
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'non-portable-path' })]);
    expect(posted).toEqual([{ type: 'project:sourceRejected', result }]);
  });

  it('rejects runtime and cache source handles before ingest', async () => {
    const ingest = vi.fn();
    const runtime = await handleProjectSourceAddHostRequest(
      {
        requestId: 'runtime-1',
        kind: 'drag-drop',
        formatId: 'nkc',
        sourcePath: 'blob:vscode-runtime',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
      },
      { postMessage: vi.fn(), ingestPort: { ingest } },
    );
    const cache = await handleProjectSourceAddHostRequest(
      {
        requestId: 'cache-1',
        kind: 'drag-drop',
        formatId: 'nkc',
        sourcePath: '/workspace/project/.neko/.cache/proxy/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
      },
      { postMessage: vi.fn(), ingestPort: { ingest } },
    );

    expect(runtime.diagnostics).toEqual([
      expect.objectContaining({ code: 'runtime-handle-persisted' }),
    ]);
    expect(cache.diagnostics).toEqual([
      expect.objectContaining({ code: 'cache-source-persisted' }),
    ]);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('converts thrown host errors into rejected results', async () => {
    const posted: ProjectSourceAddResponseMessage[] = [];
    const result = await handleProjectSourceAddHostRequest(
      {
        requestId: 'throws-1',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/workspace/project/media/clip.mp4',
        destination: { kind: 'project', directory: 'media', copyMode: 'link' },
      },
      {
        postMessage: (message) => posted.push(message),
        addSource: async () => {
          throw new Error('boom');
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'add-source-failed', message: 'boom' })],
      }),
    );
    expect(posted).toEqual([{ type: 'project:sourceRejected', result }]);
  });

  it('posts explicit rejected messages for failed results', async () => {
    const posted: ProjectSourceAddResponseMessage[] = [];
    const result: ProjectSourceAddResult = {
      requestId: 'failed-1',
      ok: false,
      diagnostics: [{ code: 'missing-source', severity: 'error', message: 'Missing source.' }],
    };

    await postProjectSourceAddResult(result, { postMessage: (message) => posted.push(message) });

    expect(posted).toEqual([{ type: 'project:sourceRejected', result }]);
  });
});
