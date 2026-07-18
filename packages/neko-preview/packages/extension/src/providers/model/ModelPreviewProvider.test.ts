import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  MODEL_PREVIEW_PROTOCOL_VERSION,
  MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
  PathResolver,
  type ModelPreviewCaptureResult,
  type ModelPreviewStagingState,
} from '@neko/shared';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getWorkspaceFolder: () => ({ uri: { fsPath: '/workspace' } }),
  },
  extensions: { getExtension: vi.fn() },
}));

vi.mock('@neko/shared/vscode/extension', () => ({
  createHostContentAccessRuntime: () => ({
    localResourceAccess: { isAuthorizedPath: vi.fn(async () => true) },
  }),
  loadHostContentPathPolicy: vi.fn(),
}));

vi.mock('../../utils/html', () => ({ getWebviewHtml: () => '<html>model</html>' }));

import { ModelPreviewProvider } from './ModelPreviewProvider';
import { ModelSourceInspectionError } from './modelSourceInspection';

describe('ModelPreviewProvider', () => {
  it('isolates two panels and rejects cross-panel identities', async () => {
    const context = extensionContext();
    const sessions = ['session-a', 'session-b'];
    const provider = providerWith(context, () => sessions.shift() ?? 'unexpected');
    const panelA = panel();
    const panelB = panel();
    await provider.resolveCustomEditor(document('/workspace/a.glb'), panelA.value, token());
    await provider.resolveCustomEditor(document('/workspace/b.glb'), panelB.value, token());

    await panelA.receive({
      type: 'model-preview/ready',
      protocolVersion: MODEL_PREVIEW_PROTOCOL_VERSION,
      sessionId: 'session-a',
    });
    await panelB.receive({
      type: 'model-preview/ready',
      protocolVersion: MODEL_PREVIEW_PROTOCOL_VERSION,
      sessionId: 'session-b',
    });
    expect(panelA.messages.at(-1)).toMatchObject({
      type: 'model-preview/load',
      staging: { sessionId: 'session-a', sourceFingerprint: 'fingerprint:a.glb' },
    });
    expect(panelB.messages.at(-1)).toMatchObject({
      type: 'model-preview/load',
      staging: { sessionId: 'session-b', sourceFingerprint: 'fingerprint:b.glb' },
    });

    await panelA.receive({
      type: 'model-preview/send-requested',
      identity: { sessionId: 'session-b', sourceFingerprint: 'fingerprint:b.glb', revision: 0 },
    });
    expect(panelA.messages.at(-1)).toMatchObject({
      type: 'model-preview/diagnostic',
      diagnostic: { code: 'session-mismatch' },
    });
    expect(panelB.messages).toHaveLength(1);
  });

  it('persists monotonic staging and rejects stale revisions', async () => {
    const context = extensionContext();
    const provider = providerWith(context, () => 'session-a');
    const modelPanel = panel();
    await provider.resolveCustomEditor(document('/workspace/a.glb'), modelPanel.value, token());
    const initial = staging('session-a', 'fingerprint:a.glb', 0);
    await modelPanel.receive({
      type: 'model-preview/state-changed',
      staging: { ...initial, revision: 1, background: '#000000' },
    });
    expect(context.workspaceState.update).toHaveBeenCalledWith(
      expect.stringContaining('fingerprint:a.glb'),
      expect.objectContaining({ revision: 1, background: '#000000' }),
    );
    await modelPanel.receive({ type: 'model-preview/state-changed', staging: initial });
    expect(modelPanel.messages.at(-1)).toMatchObject({
      diagnostic: { code: 'stale-revision' },
    });
  });

  it('restores compatible state with fresh session identity and rejects incompatible state', async () => {
    const compatible = staging('old-session', 'fingerprint:a.glb', 9);
    const compatibleContext = extensionContext(compatible);
    const compatibleProvider = providerWith(compatibleContext, () => 'new-session');
    const compatiblePanel = panel();
    await compatibleProvider.resolveCustomEditor(
      document('/workspace/a.glb'),
      compatiblePanel.value,
      token(),
    );
    await compatiblePanel.receive({
      type: 'model-preview/ready',
      protocolVersion: MODEL_PREVIEW_PROTOCOL_VERSION,
      sessionId: 'new-session',
    });
    expect(compatiblePanel.messages.at(-1)).toMatchObject({
      staging: { sessionId: 'new-session', revision: 0, background: compatible.background },
    });

    const staleContext = extensionContext({ ...compatible, sourceFingerprint: 'other' });
    const staleProvider = providerWith(staleContext, () => 'new-session');
    const stalePanel = panel();
    await staleProvider.resolveCustomEditor(
      document('/workspace/a.glb'),
      stalePanel.value,
      token(),
    );
    expect(stalePanel.messages[0]).toMatchObject({ diagnostic: { code: 'stale-state' } });
  });

  it('requests a bounded capture and delivers only its matching result', async () => {
    const deliverCapture = vi.fn(async () => undefined);
    const context = extensionContext();
    const provider = providerWith(context, () => 'session-a', deliverCapture);
    const modelPanel = panel();
    await provider.resolveCustomEditor(document('/workspace/a.glb'), modelPanel.value, token());
    const identity = {
      sessionId: 'session-a',
      sourceFingerprint: 'fingerprint:a.glb',
      revision: 0,
    };
    await modelPanel.receive({ type: 'model-preview/send-requested', identity });
    const request = modelPanel.messages.at(-1) as { requestId: string };
    expect(request).toMatchObject({
      type: 'model-preview/capture-requested',
      identity,
      settings: { width: 1024, height: 1024 },
    });
    await modelPanel.receive({
      type: 'model-preview/capture-completed',
      requestId: request.requestId,
      capture: capture(identity),
    });
    expect(deliverCapture).toHaveBeenCalledOnce();
    expect(modelPanel.messages.at(-1)).toMatchObject({ type: 'model-preview/send-succeeded' });
  });

  it('cancels close-during-load and ignores late messages after idempotent dispose', async () => {
    let release: (() => void) | undefined;
    const openSourceSession = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          release = () => reject(new Error('load cancelled'));
        }),
    );
    const context = extensionContext();
    const provider = new ModelPreviewProvider(uri('/extension'), context.value, {
      createSessionId: () => 'session-a',
      loadPathPolicy: async () => ({
        authorizedRoots: ['/workspace'],
        pathResolver: new PathResolver(),
      }),
      openSourceSession,
    });
    const modelPanel = panel();
    const resolving = provider.resolveCustomEditor(
      document('/workspace/a.glb'),
      modelPanel.value,
      token(),
    );
    await vi.waitFor(() => expect(openSourceSession).toHaveBeenCalledOnce());
    modelPanel.dispose();
    release?.();
    await resolving;
    expect(modelPanel.html).toContain('load cancelled');

    const liveProvider = providerWith(extensionContext(), () => 'session-live');
    const livePanel = panel();
    await liveProvider.resolveCustomEditor(document('/workspace/a.glb'), livePanel.value, token());
    livePanel.dispose();
    livePanel.dispose();
    const messageCount = livePanel.messages.length;
    await livePanel.receive({
      type: 'model-preview/ready',
      protocolVersion: MODEL_PREVIEW_PROTOCOL_VERSION,
      sessionId: 'session-live',
    });
    expect(livePanel.messages).toHaveLength(messageCount);
  });
});

function providerWith(
  context: ReturnType<typeof extensionContext>,
  createSessionId: () => string,
  deliverCapture = vi.fn(async () => undefined),
): ModelPreviewProvider {
  return new ModelPreviewProvider(uri('/extension'), context.value, {
    createSessionId,
    loadPathPolicy: async () => ({
      authorizedRoots: ['/workspace'],
      pathResolver: new PathResolver(),
    }),
    openSourceSession: async ({ sessionId, sourcePath }) => sourceSession(sessionId, sourcePath),
    deliverCapture,
  });
}

function sourceSession(sessionId: string, sourcePath: string) {
  const fileName = sourcePath.split('/').at(-1) ?? 'model.glb';
  const fingerprint = `fingerprint:${fileName}`;
  return {
    sessionId,
    descriptor: {
      protocolVersion: 1 as const,
      source: resourceRef(`source:${fileName}`),
      sourceFingerprint: fingerprint,
      format: 'glb' as const,
      entryUri: `webview:${sourcePath}`,
      uriMap: { [fileName]: `webview:${sourcePath}` },
      sizeBytes: 12,
    },
    assertLive(candidateSessionId: string, candidateFingerprint: string) {
      if (candidateSessionId !== sessionId || candidateFingerprint !== fingerprint) {
        throw new ModelSourceInspectionError({
          code: 'session-mismatch',
          message: 'session mismatch',
          severity: 'error',
        });
      }
    },
    dispose: vi.fn(),
  };
}

function extensionContext(stored?: unknown) {
  const get = vi.fn(() => stored);
  const update = vi.fn(async () => undefined);
  return {
    value: {
      workspaceState: { get, update },
      extensionUri: uri('/extension'),
      globalStorageUri: uri('/global'),
      subscriptions: [],
    } as never,
    workspaceState: { get, update },
  };
}

function panel() {
  const messages: unknown[] = [];
  const receiveListeners: Array<(message: unknown) => unknown> = [];
  const disposeListeners: Array<() => void> = [];
  const webview = {
    options: {},
    html: '',
    cspSource: 'webview-csp',
    asWebviewUri: vi.fn(),
    postMessage: vi.fn(async (message: unknown) => {
      messages.push(message);
      return true;
    }),
    onDidReceiveMessage: vi.fn((listener: (message: unknown) => unknown) => {
      receiveListeners.push(listener);
      return { dispose: vi.fn() };
    }),
  };
  const value = {
    webview,
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListeners.push(listener);
      return { dispose: vi.fn() };
    }),
  } as never;
  return {
    value,
    messages,
    get html() {
      return webview.html;
    },
    async receive(message: unknown) {
      await Promise.all(receiveListeners.map((listener) => listener(message)));
    },
    dispose() {
      for (const listener of disposeListeners) listener();
    },
  };
}

function token() {
  return { onCancellationRequested: () => ({ dispose: vi.fn() }) } as never;
}

function document(fsPath: string) {
  return { uri: uri(fsPath), dispose: vi.fn() } as never;
}

function uri(fsPath: string) {
  return { fsPath, path: fsPath, scheme: 'file', toString: () => `file://${fsPath}` } as never;
}

function staging(
  sessionId: string,
  sourceFingerprint: string,
  revision: number,
): ModelPreviewStagingState {
  return {
    schemaVersion: MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
    sessionId,
    sourceFingerprint,
    revision,
    transformPatches: [],
    cameraPresets: [
      {
        id: 'camera-default',
        label: 'Default',
        position: { x: 3, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
      },
    ],
    activeCameraId: 'camera-default',
    lightRig: {
      environmentIntensity: 1,
      lights: [
        { id: 'key', color: '#fff', intensity: 3, position: { x: 1, y: 2, z: 3 } },
        { id: 'fill', color: '#fff', intensity: 1, position: { x: -1, y: 1, z: 2 } },
        { id: 'rim', color: '#fff', intensity: 2, position: { x: 0, y: 2, z: -2 } },
      ],
    },
    background: '#1e1e1e',
    capture: { width: 1024, height: 1024 },
  };
}

function capture(identity: {
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  readonly revision: number;
}): ModelPreviewCaptureResult {
  const currentStaging = staging(identity.sessionId, identity.sourceFingerprint, identity.revision);
  return {
    metadata: {
      ...identity,
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      cameraId: currentStaging.activeCameraId,
    },
    dataUrl: 'data:image/png;base64,AA==',
    staging: currentStaging,
    facts: {
      bounds: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
        center: { x: 0, y: 0, z: 0 },
        size: { x: 2, y: 2, z: 2 },
        radius: 1.7,
      },
      nodeCount: 1,
      meshCount: 1,
      materialCount: 1,
      animationCount: 0,
    },
  };
}

function resourceRef(id: string) {
  return createResourceRef({
    id,
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: 'model.glb' },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: id }),
  });
}
