import { describe, expect, it, vi } from 'vitest';
import {
  PathResolver,
  THREE_REFERENCE_PROTOCOL_VERSION,
  createResourceFingerprint,
  createResourceRef,
  type ThreeReferenceStagingSnapshot,
} from '@neko/shared';
import * as vscode from 'vscode';

vi.mock('vscode', () => ({
  CancellationTokenSource: class {
    readonly token = { onCancellationRequested: () => ({ dispose: vi.fn() }) };
    cancel = vi.fn();
    dispose = vi.fn();
  },
  ViewColumn: { Active: 1 },
  window: { createWebviewPanel: vi.fn() },
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

vi.mock('../../utils/html', () => ({ getWebviewHtml: () => '<html>3d reference</html>' }));

import { ModelPreviewProvider } from './ModelPreviewProvider';
import { ModelSourceInspectionError } from './modelSourceInspection';

describe('3D Reference provider session boundary', () => {
  it('opens an explicit no-source guide panel through the same provider lifecycle', async () => {
    const provider = providerWith(extensionContext(), () => 'guide-session');
    const guidePanel = panel();
    vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(guidePanel.value);

    await provider.openBuiltinPresetPanel('guide-neutral-mannequin');
    await ready(guidePanel, 'guide-session');

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'neko.preview.3dReferenceGuide',
      '3D Reference',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    expect(guidePanel.messages.at(-1)).toMatchObject({
      panelSubject: { kind: 'builtin-preset' },
      staging: { subject: { presetId: 'guide-neutral-mannequin' } },
    });
  });

  it('initializes isolated source-model panels through the 3d-reference protocol', async () => {
    const context = extensionContext();
    const sessions = ['session-a', 'session-b'];
    const provider = providerWith(context, () => sessions.shift() ?? 'unexpected');
    const panelA = panel();
    const panelB = panel();
    await provider.resolveCustomEditor(document('/workspace/a.glb'), panelA.value, token());
    await provider.resolveCustomEditor(document('/workspace/b.glb'), panelB.value, token());

    await ready(panelA, 'session-a');
    await ready(panelB, 'session-b');
    expect(panelA.messages.at(-1)).toMatchObject({
      type: '3d-reference/session-init',
      protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
      panelSubject: { kind: 'source-model', subject: { fingerprint: 'fingerprint:a.glb' } },
      eligiblePurposes: ['appearance', 'camera'],
      staging: { sessionId: 'session-a', revision: 0 },
    });
    expect(panelB.messages.at(-1)).toMatchObject({
      type: '3d-reference/session-init',
      panelSubject: { kind: 'source-model', subject: { fingerprint: 'fingerprint:b.glb' } },
      staging: { sessionId: 'session-b' },
    });

    await panelA.receive({
      type: '3d-reference/load-completed',
      identity: { sessionId: 'session-b', revision: 0 },
    });
    expect(panelA.messages.at(-1)).toMatchObject({
      type: '3d-reference/diagnostic',
      diagnostic: { code: 'session-mismatch' },
    });
  });

  it('initializes explicit built-in and environment-only subjects without a source session', async () => {
    const context = extensionContext();
    const sessions = ['preset-session', 'environment-session'];
    const openSourceSession = vi.fn();
    const provider = providerWith(context, () => sessions.shift() ?? 'unexpected', {
      openSourceSession,
    });
    const presetPanel = panel();
    const environmentPanel = panel();

    await provider.resolveBuiltinPresetPanel('guide-neutral-mannequin', presetPanel.value, token());
    await provider.resolveEnvironmentOnlyPanel(environmentPanel.value, token());
    await ready(presetPanel, 'preset-session');
    await ready(environmentPanel, 'environment-session');

    expect(openSourceSession).not.toHaveBeenCalled();
    expect(presetPanel.messages.at(-1)).toMatchObject({
      panelSubject: {
        kind: 'builtin-preset',
        subject: { presetId: 'guide-neutral-mannequin', appearancePolicy: 'guide-only' },
      },
      eligiblePurposes: ['pose', 'camera'],
      staging: { selectedPurposes: ['pose', 'camera'], pose: { poseId: 'standing' } },
    });
    expect(environmentPanel.messages.at(-1)).toMatchObject({
      panelSubject: { kind: 'environment-only' },
      eligiblePurposes: ['camera', 'panorama-scene'],
      staging: { selectedPurposes: ['camera'] },
    });
  });

  it('persists only monotonic same-subject staging and rejects stale or ineligible updates', async () => {
    const context = extensionContext();
    const provider = providerWith(context, () => 'session-a');
    const sourcePanel = panel();
    await provider.resolveCustomEditor(document('/workspace/a.glb'), sourcePanel.value, token());
    await ready(sourcePanel, 'session-a');
    const initial = sessionInit(sourcePanel).staging;

    await sourcePanel.receive({
      type: '3d-reference/staging-changed',
      staging: { ...initial, revision: 1, selectedPurposes: ['camera'] },
    });
    expect(context.workspaceState.update).toHaveBeenCalledWith(
      expect.stringContaining('3d-reference'),
      expect.objectContaining({ revision: 1, selectedPurposes: ['camera'] }),
    );
    await sourcePanel.receive({
      type: '3d-reference/staging-changed',
      staging: { ...initial, revision: 1 },
    });
    expect(sourcePanel.messages.at(-1)).toMatchObject({ diagnostic: { code: 'stale-revision' } });
    await sourcePanel.receive({
      type: '3d-reference/staging-changed',
      staging: {
        ...initial,
        revision: 2,
        selectedPurposes: ['pose'],
        pose: { poseId: 'standing', joints: [] },
      },
    });
    expect(sourcePanel.messages.at(-1)).toMatchObject({
      diagnostic: { code: 'purpose-unsupported' },
    });
  });

  it('routes only selected eligible purpose capture requests with panel cancellation', async () => {
    const onCaptureRequested = vi.fn(async () => undefined);
    const provider = providerWith(extensionContext(), () => 'session-a', {
      onCaptureRequested,
    });
    const sourcePanel = panel();
    await provider.resolveCustomEditor(document('/workspace/a.glb'), sourcePanel.value, token());
    await ready(sourcePanel, 'session-a');

    await sourcePanel.receive({
      type: '3d-reference/capture-requested',
      requestId: 'camera-capture',
      identity: { sessionId: 'session-a', revision: 0 },
      purpose: 'camera',
    });
    expect(onCaptureRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'camera-capture',
        purpose: 'camera',
        signal: expect.any(AbortSignal),
      }),
    );
    const signal = onCaptureRequested.mock.calls[0]![0].signal;
    sourcePanel.dispose();
    expect(signal.aborted).toBe(true);
  });

  it('reuses the package panoramic authorization helper without nesting another provider', async () => {
    const authorizePanoramicImageSource = vi.fn(async () => ({
      sourceRef: resourceRef('panorama'),
      fingerprint: 'panorama-fingerprint',
      mediaType: 'image/png' as const,
      sizeBytes: 1024,
      webviewUri: 'webview:/workspace/scene_360.png',
    }));
    const provider = providerWith(extensionContext(), () => 'environment-session', {
      authorizePanoramicImageSource,
    });
    const environmentPanel = panel();
    await provider.resolveEnvironmentOnlyPanel(environmentPanel.value, token());
    const result = await provider.authorizePanoramicEnvironment(
      environmentPanel.value,
      uri('/workspace/scene_360.png'),
    );
    expect(result.fingerprint).toBe('panorama-fingerprint');
    expect(authorizePanoramicImageSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: '/workspace/scene_360.png',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('keeps a failed real panorama visible and never substitutes the bundled panorama grid', async () => {
    const authorizePanoramicImageSource = vi.fn(async () => {
      throw new Error('panorama authorization failed');
    });
    const provider = providerWith(extensionContext(), () => 'environment-session', {
      authorizePanoramicImageSource,
    });
    const environmentPanel = panel();
    await provider.resolveEnvironmentOnlyPanel(environmentPanel.value, token());
    await expect(
      provider.authorizePanoramicEnvironment(
        environmentPanel.value,
        uri('/workspace/broken_360.png'),
      ),
    ).rejects.toThrow('panorama authorization failed');
    await ready(environmentPanel, 'environment-session');
    expect(environmentPanel.messages.at(-1)).toMatchObject({
      panelSubject: { kind: 'environment-only' },
    });
    expect(JSON.stringify(environmentPanel.messages)).not.toContain('guide-neutral-panorama-grid');
  });

  it('does not fall back to a built-in preset when source loading fails', async () => {
    const context = extensionContext();
    const provider = providerWith(context, () => 'session-a', {
      openSourceSession: async () => {
        throw new ModelSourceInspectionError({
          code: 'source-missing',
          message: 'source missing',
          severity: 'error',
        });
      },
    });
    const sourcePanel = panel();
    await provider.resolveCustomEditor(
      document('/workspace/missing.glb'),
      sourcePanel.value,
      token(),
    );
    expect(sourcePanel.html).toContain('source missing');
    expect(sourcePanel.messages).toEqual([]);
    expect(context.workspaceState.update).not.toHaveBeenCalled();
  });

  it('ignores disposed Webviews instead of accessing panel.webview after disposal', async () => {
    let finishSource: ((value: ReturnType<typeof sourceSession>) => void) | undefined;
    const pending = new Promise<ReturnType<typeof sourceSession>>((resolve) => {
      finishSource = resolve;
    });
    const provider = providerWith(extensionContext(), () => 'session-a', {
      openSourceSession: () => pending,
    });
    const sourcePanel = panel();
    const resolution = provider.resolveCustomEditor(
      document('/workspace/a.glb'),
      sourcePanel.value,
      token(),
    );
    await Promise.resolve();
    await Promise.resolve();
    sourcePanel.dispose();
    const session = sourceSession('session-a', '/workspace/a.glb');
    finishSource?.(session);
    await resolution;
    expect(session.dispose).toHaveBeenCalledOnce();
  });
});

function providerWith(
  context: ReturnType<typeof extensionContext>,
  createSessionId: () => string,
  overrides: Record<string, unknown> = {},
): ModelPreviewProvider {
  return new ModelPreviewProvider(uri('/extension'), context.value, {
    createSessionId,
    loadPathPolicy: async () => ({
      authorizedRoots: ['/workspace'],
      pathResolver: new PathResolver(),
    }),
    openSourceSession: async ({ sessionId, sourcePath }) => sourceSession(sessionId, sourcePath),
    ...overrides,
  });
}

function sourceSession(sessionId: string, sourcePath: string) {
  const fileName = sourcePath.split('/').at(-1) ?? 'model.glb';
  const fingerprint = `fingerprint:${fileName}`;
  return {
    sessionId,
    descriptor: {
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
  let disposed = false;
  let html = '';
  const assertLive = () => {
    if (disposed) throw new Error('Webview is disposed');
  };
  const webview = {
    options: {},
    get html() {
      return html;
    },
    set html(value: string) {
      assertLive();
      html = value;
    },
    cspSource: 'webview-csp',
    asWebviewUri: vi.fn(),
    postMessage: vi.fn(async (message: unknown) => {
      assertLive();
      messages.push(message);
      return true;
    }),
    onDidReceiveMessage: vi.fn((listener: (message: unknown) => unknown) => {
      assertLive();
      receiveListeners.push(listener);
      return { dispose: vi.fn() };
    }),
  };
  const value = {
    get webview() {
      assertLive();
      return webview;
    },
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListeners.push(listener);
      return { dispose: vi.fn() };
    }),
  } as never;
  return {
    value,
    messages,
    get html() {
      return html;
    },
    async receive(message: unknown) {
      await Promise.all(receiveListeners.map((listener) => listener(message)));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const listener of disposeListeners) listener();
    },
  };
}

async function ready(target: ReturnType<typeof panel>, sessionId: string) {
  await target.receive({
    type: '3d-reference/ready',
    protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
    sessionId,
  });
}

function sessionInit(target: ReturnType<typeof panel>) {
  return target.messages.find(
    (message): message is { staging: ThreeReferenceStagingSnapshot } =>
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === '3d-reference/session-init',
  )!;
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
