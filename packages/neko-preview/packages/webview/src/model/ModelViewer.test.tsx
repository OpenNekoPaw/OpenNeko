// @vitest-environment jsdom

import { act } from 'react';
import ReactDOM from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import { installMockWebviewWindow } from '@neko/shared/vscode/test-utils';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import { ModelViewer } from './ModelViewer';
import type { ThreeModelRuntimeFactory, ThreeModelRuntimePort } from './threeRuntime';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('ModelViewer', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('loads, stages, captures, and disposes through a fakeable panel-owned runtime', async () => {
    const mockWindow = installMockWebviewWindow();
    const runtime = fakeRuntime();
    const factory: ThreeModelRuntimeFactory = { create: vi.fn(() => runtime.value) };
    const container = document.createElement('div');
    document.body.append(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider service={i18nService}>
          <ModelViewer runtimeFactory={factory} sessionId="session-1" />
        </I18nProvider>,
      );
    });
    expect(mockWindow.api.postedMessages[0]).toEqual({
      type: 'model-preview/ready',
      protocolVersion: 1,
      sessionId: 'session-1',
    });

    const load = loadMessage();
    const sourceSnapshot = JSON.stringify(load.source);
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: load }));
      await Promise.resolve();
    });
    expect(runtime.load).toHaveBeenCalledWith(load.source);
    expect(runtime.applyStaging).toHaveBeenCalledWith(load.staging);
    expect(JSON.stringify(load.source)).toBe(sourceSnapshot);
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toMatchObject({
      dataset: expect.objectContaining({
        viewerStatus: 'ready',
        meshCount: '1',
        activeCameraId: 'camera-default',
        keyLightIntensity: '3',
        deliveryStatus: 'idle',
      }),
    });
    expect(
      container.querySelector('canvas[aria-label="Interactive 3D model canvas"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-scene-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-view-controls"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-inspector"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="model-preview-viewport-toolbar"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('aside[aria-label="Temporary model staging controls"]'),
    ).not.toBeNull();
    expect(mockWindow.api.postedMessages).toContainEqual(
      expect.objectContaining({
        type: 'model-preview/load-completed',
        identity: { sessionId: 'session-1', sourceFingerprint: 'fingerprint-1', revision: 0 },
      }),
    );

    const sendButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Send staged view to Agent'),
    );
    expect(sendButton).toBeDefined();
    await act(async () => sendButton?.click());
    expect(mockWindow.api.postedMessages.at(-1)).toEqual({
      type: 'model-preview/send-requested',
      identity: { sessionId: 'session-1', sourceFingerprint: 'fingerprint-1', revision: 0 },
    });
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.deliveryStatus',
      'sending',
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'model-preview/capture-requested',
            requestId: 'capture-1',
            identity: { sessionId: 'session-1', sourceFingerprint: 'fingerprint-1', revision: 0 },
            settings: { width: 1024, height: 1024 },
          },
        }),
      );
      await Promise.resolve();
    });
    expect(runtime.capture).toHaveBeenCalledWith({ width: 1024, height: 1024 });
    expect(mockWindow.api.postedMessages.at(-1)).toMatchObject({
      type: 'model-preview/capture-completed',
      requestId: 'capture-1',
      capture: {
        metadata: { cameraId: 'camera-default', width: 1024, height: 1024 },
        dataUrl: 'data:image/png;base64,AA==',
      },
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'model-preview/send-succeeded',
            identity: { sessionId: 'session-1', sourceFingerprint: 'fingerprint-1', revision: 0 },
          },
        }),
      );
    });
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.deliveryStatus',
      'succeeded',
    );

    await act(async () => root.unmount());
    expect(runtime.dispose).toHaveBeenCalledOnce();
    mockWindow.dispose();
  });

  it('keeps independent runtime roots and reports stale capture failure visibly', async () => {
    const mockWindow = installMockWebviewWindow();
    const first = fakeRuntime();
    const second = fakeRuntime();
    const runtimes = [first.value, second.value];
    const factory: ThreeModelRuntimeFactory = {
      create: vi.fn(() => {
        const runtime = runtimes.shift();
        if (!runtime) throw new Error('No runtime available');
        return runtime;
      }),
    };
    const firstContainer = document.createElement('div');
    document.body.append(firstContainer);
    const firstRoot = ReactDOM.createRoot(firstContainer);
    await act(async () => {
      firstRoot.render(
        <I18nProvider service={i18nService}>
          <ModelViewer runtimeFactory={factory} sessionId="session-1" />
        </I18nProvider>,
      );
    });
    await act(async () => firstRoot.unmount());
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();

    const secondContainer = document.createElement('div');
    document.body.append(secondContainer);
    const secondRoot = ReactDOM.createRoot(secondContainer);
    await act(async () => {
      secondRoot.render(
        <I18nProvider service={i18nService}>
          <ModelViewer runtimeFactory={factory} sessionId="session-2" />
        </I18nProvider>,
      );
    });
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'model-preview/capture-requested',
            requestId: 'stale',
            identity: { sessionId: 'session-1', sourceFingerprint: 'old', revision: 0 },
            settings: { width: 4096, height: 4096 },
          },
        }),
      );
      await Promise.resolve();
    });
    expect(mockWindow.api.postedMessages.at(-1)).toMatchObject({
      type: 'model-preview/diagnostic',
      diagnostic: { code: 'capture-failed' },
    });
    await act(async () => secondRoot.unmount());
    expect(second.dispose).toHaveBeenCalledOnce();
    mockWindow.dispose();
  });
});

function fakeRuntime() {
  const facts = {
    bounds: {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 2 },
      radius: 1.7,
    },
    nodeCount: 2,
    meshCount: 1,
    materialCount: 1,
    animationCount: 0,
  };
  const load = vi.fn(async () => facts);
  const applyStaging = vi.fn();
  const capture = vi.fn(() => 'data:image/png;base64,AA==');
  const dispose = vi.fn();
  const value: ThreeModelRuntimePort = {
    load,
    applyStaging,
    getNodes: () => [
      {
        path: 'root',
        label: 'root',
        mesh: false,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
      {
        path: 'root/0:mesh',
        label: 'mesh',
        mesh: true,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    ],
    setTransformMode: vi.fn(),
    setTransformEnabled: vi.fn(),
    frameModel: vi.fn(),
    resize: vi.fn(),
    capture,
    dispose,
  };
  return { value, load, applyStaging, capture, dispose };
}

function loadMessage() {
  return {
    type: 'model-preview/load' as const,
    source: {
      protocolVersion: 1 as const,
      source: createResourceRef({
        scope: 'project',
        provider: 'test',
        kind: 'media',
        source: { kind: 'file', projectRelativePath: 'model.glb' },
        fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'fingerprint-1' }),
      }),
      sourceFingerprint: 'fingerprint-1',
      format: 'glb' as const,
      entryUri: 'webview:model.glb',
      uriMap: { 'model.glb': 'webview:model.glb' },
      sizeBytes: 12,
    },
    staging: {
      schemaVersion: 1 as const,
      sessionId: 'session-1',
      sourceFingerprint: 'fingerprint-1',
      revision: 0,
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
          { id: 'key' as const, color: '#fff', intensity: 3, position: { x: 1, y: 2, z: 3 } },
          { id: 'fill' as const, color: '#fff', intensity: 1, position: { x: -1, y: 1, z: 2 } },
          { id: 'rim' as const, color: '#fff', intensity: 2, position: { x: 0, y: 2, z: -2 } },
        ],
      },
      background: '#1e1e1e',
      capture: { width: 1024, height: 1024 },
    },
  };
}
