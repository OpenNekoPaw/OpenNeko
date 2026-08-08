import { describe, expect, it, vi } from 'vitest';
import type { PreviewHostRuntime, PreviewProjection } from '@neko/preview-domain';
import { createPreviewRuntimeBootstrap } from './runtime-bootstrap';

const projection = {
  identity: {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'preview-1',
    viewInstanceId: 'view-instance-1',
    documentId: 'document-1',
    sessionId: 'session-1',
    rendererSessionId: 'endpoint-1',
  },
  presentation: 'temporary',
  status: 'loading',
} satisfies PreviewProjection;

describe('createPreviewRuntimeBootstrap', () => {
  it('starts one exact Snapshot before the Root consumer reads it', async () => {
    const runtime = createRuntime();
    const bootstrap = createPreviewRuntimeBootstrap(runtime);

    bootstrap.prepare();
    expect(runtime.getSnapshot).toHaveBeenCalledOnce();
    const first = bootstrap.getSnapshot();
    const second = bootstrap.getSnapshot();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual(projection);
    expect(runtime.getSnapshot).toHaveBeenCalledOnce();
  });

  it('keeps exact resources independent and rejects reads after disposal', () => {
    const runtime = createRuntime();
    const first = createPreviewRuntimeBootstrap(runtime);
    const second = createPreviewRuntimeBootstrap(runtime);
    first.prepare();
    second.prepare();
    expect(runtime.getSnapshot).toHaveBeenCalledTimes(2);

    first.dispose();
    expect(() => first.getSnapshot()).toThrow('disposed');
    expect(() => second.getSnapshot()).not.toThrow();
  });
});

function createRuntime(): PreviewHostRuntime {
  return {
    identity: projection.identity,
    getSnapshot: vi.fn(async () => projection),
    execute: vi.fn(async () => projection),
    subscribe: vi.fn(() => () => undefined),
  };
}
