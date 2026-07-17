// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_CUT_DRAFT_KIND,
  CANVAS_CUT_DRAFT_SCHEMA_VERSION,
  PROJECT_FILE_SNAPSHOT_REQUEST,
  PROJECT_FILE_SNAPSHOT_RESPONSE,
  type CanvasCutDraftPayload,
} from '@neko/shared';
import { useEditorStore } from '../stores/editor-store';
import { useVSCodeMessaging } from './useVSCodeMessaging';
import type { ProjectData } from '../types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const vscodePostMessage = vi.hoisted(() => vi.fn());

vi.mock('../utils/vscodeApi', () => ({
  getVSCodeAPI: () => ({
    postMessage: vscodePostMessage,
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vscodePostMessage,
}));

vi.mock('../services/frameServerMessages', () => ({
  isFrameServerMessage: vi.fn(() => false),
  publishFrameServerMessage: vi.fn(),
}));

vi.mock('../utils/fileUri', () => ({
  getFileUri: vi.fn(),
  handleFileUriResponse: vi.fn(),
  requestFileUri: vi.fn(),
}));

vi.mock('../services', () => ({
  getMediaInfoService: () => ({
    getDuration: vi.fn(async () => 12),
  }),
}));

vi.mock('../services/mediaProxyFactory', () => ({
  getMediaProxy: () => ({
    probeMediaInfo: vi.fn(async () => ({ hasAudio: false })),
    extractSubtitles: vi.fn(async () => []),
  }),
}));

describe('useVSCodeMessaging project snapshot protocol', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vscodePostMessage.mockClear();
    useEditorStore.setState({ project: createProject(), projectRoot: undefined });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = '';
    useEditorStore.setState({ project: null, projectRoot: undefined });
  });

  it('returns the current Cut project when the host requests a project-file snapshot', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: PROJECT_FILE_SNAPSHOT_REQUEST,
            requestId: 'snapshot-1',
            formatId: 'nkv',
            saveReason: 'vscode-save',
          },
        }),
      );
    });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: PROJECT_FILE_SNAPSHOT_RESPONSE,
      requestId: 'snapshot-1',
      ok: true,
      document: createProject(),
    });
  });

  it('does not register host message handlers for send-only callers', () => {
    act(() => {
      root.render(<Harness />);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: PROJECT_FILE_SNAPSHOT_REQUEST,
            requestId: 'snapshot-send-only',
            formatId: 'nkv',
            saveReason: 'vscode-save',
          },
        }),
      );
    });

    expect(vscodePostMessage).not.toHaveBeenCalled();
  });

  it('projects a typed Engine unavailable diagnostic and clears it on ready', () => {
    act(() => {
      root.render(<EngineDiagnosticHarness />);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'engine:status',
            status: 'unavailable',
            diagnostic: {
              code: 'cut.engine.unavailable',
              message: 'Engine unavailable',
            },
          },
        }),
      );
    });
    expect(host.querySelector('[data-diagnostic-code="cut.engine.unavailable"]')?.textContent).toBe(
      'Engine unavailable',
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'engine:status', status: 'ready' } }),
      );
    });
    expect(host.querySelector('[data-diagnostic-code="cut.engine.unavailable"]')).toBeNull();
  });

  it('sends project-changed snapshots when the Cut store changes locally', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    const changedProject = createProject({ name: 'Changed Locally' });
    act(() => {
      useEditorStore.setState({ project: changedProject });
    });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: 'project:changed',
      document: changedProject,
    });
  });

  it('does not echo extension update messages as project-changed snapshots', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    const loadedProject = createProject({ name: 'Loaded From Extension' });
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'update',
            content: loadedProject,
            projectRoot: '/workspace/project',
          },
        }),
      );
    });

    expect(vscodePostMessage).not.toHaveBeenCalledWith({
      type: 'project:changed',
      document: loadedProject,
    });
  });

  it('does not echo VS Code save confirmations as project-changed snapshots', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'saved',
          },
        }),
      );
    });

    expect(vscodePostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:changed',
      }),
    );
  });

  it('adds project:addSource results to the timeline before project snapshots are saved', async () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'project:sourceAdded',
            result: {
              requestId: 'add-source-1',
              ok: true,
              durablePath: 'cases/720P.mp4',
              diagnostics: [],
              ingest: {
                status: 'ready',
                request: {
                  mode: 'link',
                  destination: { kind: 'project', directory: 'media', copyMode: 'link' },
                  metadata: {
                    addToTimeline: true,
                    mediaType: 'video',
                    name: '720P.mp4',
                  },
                },
                source: { kind: 'file', path: 'cases/720P.mp4' },
                contractedPath: 'cases/720P.mp4',
              },
            },
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const projectChanged = vscodePostMessage.mock.calls.find(
      ([message]) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === 'project:changed',
    )?.[0] as { document?: ProjectData } | undefined;
    expect(projectChanged?.document?.tracks[0]?.elements[0]).toMatchObject({
      type: 'media',
      src: 'cases/720P.mp4',
      name: '720P.mp4',
      duration: 12,
    });

    vscodePostMessage.mockClear();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: PROJECT_FILE_SNAPSHOT_REQUEST,
            requestId: 'snapshot-after-add',
            formatId: 'nkv',
            saveReason: 'vscode-save',
          },
        }),
      );
    });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: PROJECT_FILE_SNAPSHOT_RESPONSE,
      requestId: 'snapshot-after-add',
      ok: true,
      document: expect.objectContaining({
        tracks: [
          expect.objectContaining({
            elements: [
              expect.objectContaining({
                type: 'media',
                src: 'cases/720P.mp4',
                name: '720P.mp4',
              }),
            ],
          }),
        ],
      }),
    });
  });

  it('imports Canvas draft payloads into the Cut timeline and emits minimal sync', async () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'importCanvasDraft',
            requestId: 'import-request-1',
            payload: createCanvasDraftPayload(),
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const changedProject = findPostedProjectChanged()?.document;
    const mediaElement = changedProject?.tracks
      .flatMap((track) => track.elements)
      .find((element) => element.type === 'media');
    expect(mediaElement).toMatchObject({
      type: 'media',
      src: 'media/shot-a.mp4',
      name: 'Shot A',
      duration: 2.5,
      startTime: 0,
      lineage: {
        shotNodeId: 'shot-a',
        generationId: '',
        planId: 'route-main',
        routeLevel: 'canvas-route',
      },
    });
    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: 'canvasTimelineSync',
      requestId: 'import-request-1',
      payload: {
        source: 'neko-cut',
        reason: 'storyboard-import',
        shots: [
          expect.objectContaining({
            shotId: 'shot-a',
            projectName: 'Canvas Route',
            duration: 2.5,
            selectedInTimeline: true,
          }),
        ],
      },
    });
  });

  it('rejects invalid Canvas draft imports without mutating the Cut timeline', async () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'importCanvasDraft',
            requestId: 'import-request-invalid',
            payload: {
              ...createCanvasDraftPayload(),
              schemaVersion: 999,
            },
          },
        }),
      );
      await Promise.resolve();
    });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: 'canvasDraftImportRejected',
      requestId: 'import-request-invalid',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'draft-invalid-schema-version' }),
      ]),
    });
    expect(findPostedProjectChanged()).toBeUndefined();
  });
});

function Harness({
  subscribeToExtensionMessages = false,
}: {
  readonly subscribeToExtensionMessages?: boolean;
}): React.ReactElement | null {
  useVSCodeMessaging({ subscribeToExtensionMessages });
  return null;
}

function EngineDiagnosticHarness(): React.ReactElement | null {
  const { engineDiagnostic } = useVSCodeMessaging({ subscribeToExtensionMessages: true });
  return engineDiagnostic ? (
    <div data-diagnostic-code={engineDiagnostic.code}>{engineDiagnostic.message}</div>
  ) : null;
}

function createProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Snapshot Test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Main Track',
        type: 'media',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
    ...overrides,
  };
}

function findPostedProjectChanged(): { readonly document?: ProjectData } | undefined {
  const match = [...vscodePostMessage.mock.calls].reverse().find((call: readonly unknown[]) => {
    const message = call[0];
    return (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === 'project:changed'
    );
  });
  return match?.[0] as { document?: ProjectData } | undefined;
}

function createCanvasDraftPayload(
  overrides: Partial<CanvasCutDraftPayload> = {},
): CanvasCutDraftPayload {
  return {
    kind: CANVAS_CUT_DRAFT_KIND,
    schemaVersion: CANVAS_CUT_DRAFT_SCHEMA_VERSION,
    source: { canvasUri: 'file:///workspace/story.nkc', revision: 1 },
    route: {
      id: 'route-main',
      title: 'Main route',
      entryUnitId: 'unit-a',
      unitIds: ['unit-a'],
      sourceKind: 'auto-entry',
      totalDurationMs: 2500,
    },
    projectName: 'Canvas Route',
    units: [
      {
        id: 'unit-a',
        kind: 'shot',
        renderMode: 'story-preview',
        durationMs: 2500,
        label: 'Shot A',
        sourceMapping: {
          routeId: 'route-main',
          canvasUnitId: 'unit-a',
          canvasNodeId: 'node-a',
          canvasUnitKind: 'shot',
          sceneId: 'scene-a',
          shotId: 'shot-a',
        },
        media: [{ role: 'source', assetPath: 'media/shot-a.mp4' }],
      },
    ],
    ...overrides,
  };
}
