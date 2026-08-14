import type { TextDocumentProjection } from '@neko/text-editor-domain';
import { describe, expect, it, vi } from 'vitest';
import type { TextEditorHostRuntime } from './host-runtime';
import { createTextEditorRuntimeBootstrap } from './runtime-bootstrap';

describe('createTextEditorRuntimeBootstrap', () => {
  it('starts one projection before UI subscription and replays the same result', async () => {
    let releaseProjection = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseProjection = resolve;
    });
    const projection = fixtureProjection();
    const project = vi.fn(async () => {
      await gate;
      return projection;
    });
    const unsubscribe = vi.fn();
    const runtime = {
      project,
      subscribe: vi.fn(() => unsubscribe),
    } as unknown as TextEditorHostRuntime;
    const bootstrap = createTextEditorRuntimeBootstrap(runtime);

    bootstrap.prepare();
    bootstrap.prepare();
    expect(project).toHaveBeenCalledOnce();
    const observed: TextDocumentProjection[] = [];
    bootstrap.subscribe((next) => observed.push(next));

    releaseProjection();
    await expect(bootstrap.getProjection()).resolves.toBe(projection);
    expect(observed).toEqual([projection]);
    expect(project).toHaveBeenCalledOnce();

    const replayed: TextDocumentProjection[] = [];
    bootstrap.subscribe((next) => replayed.push(next));
    expect(replayed).toEqual([projection]);
    bootstrap.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps a newer runtime event authoritative over a pending projection', async () => {
    let releaseProjection = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseProjection = resolve;
    });
    let runtimeListener: ((projection: TextDocumentProjection) => void) | undefined;
    const initial = fixtureProjection();
    const newer = { ...initial, source: '# Newer\n', editSequence: 1 };
    const runtime = {
      project: vi.fn(async () => {
        await gate;
        return initial;
      }),
      subscribe: vi.fn((listener) => {
        runtimeListener = listener;
        return () => undefined;
      }),
    } as unknown as TextEditorHostRuntime;
    const bootstrap = createTextEditorRuntimeBootstrap(runtime);
    const observed: TextDocumentProjection[] = [];

    bootstrap.prepare();
    bootstrap.subscribe((next) => observed.push(next));
    runtimeListener?.(newer);
    releaseProjection();

    await expect(bootstrap.getProjection()).resolves.toBe(newer);
    expect(observed).toEqual([newer]);
    bootstrap.dispose();
  });
});

function fixtureProjection(): TextDocumentProjection {
  return {
    identity: {
      workspaceId: 'workspace-1',
      documentId: 'notes/story.md',
      locator: { kind: 'workspace-file', path: 'notes/story.md' },
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
    },
    sessionId: 'editor-session-1',
    mode: 'markdown',
    source: '# Draft\n',
    editSequence: 0,
    dirty: false,
    conflict: false,
    diagnostics: [],
  };
}
