// @vitest-environment jsdom

import { act } from 'react';
import ReactDOM from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  THREE_REFERENCE_PROTOCOL_VERSION,
  THREE_REFERENCE_STAGING_SCHEMA_VERSION,
} from '@neko/shared';
import { installMockWebviewWindow } from '@neko/shared/vscode/test-utils';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import { ModelViewer } from './ModelViewer';
import type {
  ThreeModelRuntimeCallbacks,
  ThreeModelRuntimeFactory,
  ThreeModelRuntimePort,
} from './threeRuntime';

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

  it('loads, stages, rejects legacy capture, and disposes through a fakeable panel-owned runtime', async () => {
    const mockWindow = installMockWebviewWindow();
    const runtime = fakeRuntime();
    const factory: ThreeModelRuntimeFactory = {
      create: vi.fn((_canvas, callbacks) => {
        callbacks?.onViewChanged?.({
          orientation: {
            x: { x: 0, y: 0, depth: 1 },
            y: { x: 0, y: -1, depth: 0 },
            z: { x: 1, y: 0, depth: 0 },
          },
          distance: 7,
          target: { x: 1, y: 2, z: 3 },
        });
        return runtime.value;
      }),
    };
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
      type: '3d-reference/ready',
      protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
      sessionId: 'session-1',
    });
    expect(runtime.resize).toHaveBeenCalledWith(800, 600);

    const load = loadMessage();
    const sourceSnapshot = JSON.stringify(load.panelSubject);
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: load }));
      await Promise.resolve();
    });
    expect(runtime.load).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFingerprint: 'fingerprint-1',
        entryUri: 'webview:model.glb',
      }),
    );
    expect(runtime.applyStaging).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', sourceFingerprint: 'fingerprint-1' }),
    );
    expect(JSON.stringify(load.panelSubject)).toBe(sourceSnapshot);
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toMatchObject({
      dataset: expect.objectContaining({
        viewerStatus: 'ready',
        meshCount: '1',
        activeCameraId: 'camera-default',
        keyLightIntensity: '3',
        viewDistance: '7',
        viewTarget: '1,2,3',
        selectionKind: 'scene',
      }),
    });
    expect(
      container.querySelector('canvas[aria-label="Interactive 3D reference canvas"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-scene-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-view-controls"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-inspector"]')).not.toBeNull();
    expect(container.querySelector('.model-preview__readonly-badge')?.textContent).toContain(
      'Read-only source',
    );
    expect(container.querySelectorAll('.model-preview__facts > div')).toHaveLength(4);
    expect(
      container.querySelectorAll(
        '[data-testid="model-preview-scene-inspector"] .model-preview__inspector-section',
      ),
    ).toHaveLength(2);
    expect(container.querySelector('[data-testid="3d-reference-controls"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-scene-inspector"]')).not.toBeNull();
    const viewportToolbar = container.querySelector<HTMLElement>(
      '[data-testid="model-preview-viewport-toolbar"]',
    );
    expect(viewportToolbar?.classList.contains('neko-vtoolbar')).toBe(false);
    expect(viewportToolbar?.classList.contains('neko-floating-toolbar')).toBe(true);
    expect(viewportToolbar?.dataset.activeIndicator).toBe('button');
    expect(viewportToolbar?.dataset.density).toBe('compact');
    expect(viewportToolbar?.dataset.orientation).toBe('horizontal');
    expect(viewportToolbar?.dataset.shape).toBe('pill');
    expect(viewportToolbar?.getAttribute('role')).toBe('toolbar');
    expect(viewportToolbar?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(viewportToolbar?.querySelector('.codicon')).toBeNull();
    const viewportIcons = viewportToolbar?.querySelectorAll('button svg');
    expect(viewportIcons).toHaveLength(13);
    viewportIcons?.forEach((icon) => {
      expect(icon.getAttribute('width')).toBe('18');
      expect(icon.getAttribute('height')).toBe('18');
      expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    });
    const navigationGroup = viewportToolbar?.querySelector(
      '[data-model-preview-toolbar-group="navigation"]',
    );
    expect(navigationGroup?.classList.contains('neko-toolbar-mode-group')).toBe(true);
    expect(navigationGroup?.getAttribute('data-active-mode')).toBe('navigate');
    expect(container.querySelector('[data-testid="model-preview-orientation"]')).not.toBeNull();
    const resetView = container.querySelector<HTMLButtonElement>('button[aria-label="Reset view"]');
    await act(async () => resetView?.click());
    expect(runtime.frameModel).toHaveBeenCalledOnce();

    const gridToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide ground grid"]',
    );
    expect(gridToggle?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => gridToggle?.click());
    expect(runtime.setGroundGridVisible).toHaveBeenCalledWith(false);
    expect(container.querySelector('button[aria-label="Show ground grid"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.stagingRevision',
      '0',
    );

    const axesToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide XYZ axes"]',
    );
    await act(async () => axesToggle?.click());
    expect(container.querySelector('[data-testid="model-preview-orientation"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Show XYZ axes"]')).not.toBeNull();
    expect(container.querySelector('aside[data-inspector-kind="scene"]')).not.toBeNull();

    const nodeSearch = container.querySelector<HTMLInputElement>('#model-preview-node-search');
    await act(async () => {
      setTextInputValue(nodeSearch, 'mesh');
      nodeSearch?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const clearSearch = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear node search"]',
    );
    expect(clearSearch).not.toBeNull();
    await act(async () => clearSearch?.click());
    expect(nodeSearch?.value).toBe('');

    expect(mockWindow.api.postedMessages).toContainEqual(
      expect.objectContaining({
        type: '3d-reference/load-completed',
        identity: { sessionId: 'session-1', revision: 0 },
      }),
    );

    const environmentMessage = panoramaEnvironmentMessage(load);
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: environmentMessage }));
      await Promise.resolve();
    });
    expect(runtime.setPanoramaEnvironment).toHaveBeenCalledWith({
      runtime: environmentMessage.runtime,
      orientation: environmentMessage.staging.environment.orientation,
    });
    expect(
      container.querySelector('[data-property-id="reference-panorama-yawDeg"]'),
    ).not.toBeNull();
    const captureAppearance = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Capture Appearance',
    );
    await act(async () => captureAppearance?.click());
    expect(runtime.capturePurpose).toHaveBeenCalledWith(
      'appearance',
      { width: 1024, height: 1024 },
      { poseControlMode: undefined },
    );
    expect(container.querySelector('.model-preview__output-preview')).not.toBeNull();

    expect(
      [...container.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Send staged view to Agent'),
      ),
    ).toBeUndefined();
    const postedMessageCount = mockWindow.api.postedMessages.length;
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
    expect(runtime.capture).not.toHaveBeenCalled();
    expect(mockWindow.api.postedMessages).toHaveLength(postedMessageCount);

    await act(async () => root.unmount());
    expect(runtime.dispose).toHaveBeenCalledOnce();
    mockWindow.dispose();
  });

  it('loads a builtin guide through the declared preset runtime and applies its pose', async () => {
    const mockWindow = installMockWebviewWindow();
    const runtime = fakeRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider service={i18nService}>
          <ModelViewer
            runtimeFactory={{ create: vi.fn(() => runtime.value) }}
            sessionId="session-guide"
          />
        </I18nProvider>,
      );
    });
    const message = builtinPresetMessage();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: message }));
      await Promise.resolve();
    });
    expect(runtime.load).not.toHaveBeenCalled();
    expect(runtime.loadPreset).toHaveBeenCalledWith(message.panelSubject);
    expect(runtime.applyReferencePose).toHaveBeenCalledWith(message.staging.pose);
    expect(container.querySelector('[role="note"]')?.textContent).toContain(
      'Guide only — not an appearance reference',
    );
    const appearancePurpose = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Appearance',
    );
    const posePurpose = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Pose',
    );
    expect(appearancePurpose?.disabled).toBe(true);
    expect(posePurpose?.getAttribute('aria-pressed')).toBe('true');
    const poseCards = container.querySelectorAll<HTMLButtonElement>('.model-preview__pose-card');
    expect(poseCards).toHaveLength(2);
    expect(poseCards[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(poseCards[0]?.querySelector('svg')).not.toBeNull();
    runtime.applyReferencePose.mockClear();
    await act(async () => poseCards[1]?.click());
    const walkingPreset = message.panelSubject.runtime.poseCapabilities.posePresets[1];
    expect(runtime.applyReferencePose).toHaveBeenCalledWith({
      poseId: walkingPreset?.poseId,
      joints: walkingPreset?.joints,
    });
    expect(mockWindow.api.postedMessages).toContainEqual(
      expect.objectContaining({
        type: '3d-reference/staging-changed',
        staging: expect.objectContaining({
          revision: 1,
          pose: { poseId: walkingPreset?.poseId, joints: walkingPreset?.joints },
        }),
      }),
    );
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.viewerStatus',
      'ready',
    );
    await act(async () => root.unmount());
    mockWindow.dispose();
  });

  it('creates temporary cameras and lights and routes preset and 720 requests to the host', async () => {
    const mockWindow = installMockWebviewWindow();
    const runtime = fakeRuntime();
    const container = document.createElement('div');
    document.body.append(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider service={i18nService}>
          <ModelViewer runtimeFactory={{ create: () => runtime.value }} sessionId="session-1" />
        </I18nProvider>,
      );
    });
    const load = loadMessage();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: load }));
      await Promise.resolve();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Add camera"]')?.click();
      await Promise.resolve();
    });
    const cameraOptions = document.body.querySelectorAll<HTMLButtonElement>(
      'button[data-creation-option-id^="front"], button[data-creation-option-id="left"], button[data-creation-option-id="right"], button[data-creation-option-id="rear"]',
    );
    expect(cameraOptions).toHaveLength(6);
    cameraOptions[0]?.focus();
    cameraOptions[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(document.activeElement).toBe(cameraOptions[1]);
    await act(async () => cameraOptions[1]?.click());
    expect(
      container.querySelector('[data-tree-item-id="model-selection:camera:camera-front-left"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.selectionKind',
      'camera',
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add directional light"]')
        ?.click();
      await Promise.resolve();
    });
    const overheadLight = document.body.querySelector<HTMLButtonElement>(
      'button[data-creation-option-id="overhead"]',
    );
    expect(overheadLight).not.toBeNull();
    await act(async () => overheadLight?.click());
    expect(
      container.querySelector('[data-tree-item-id="model-selection:light:light-overhead"]'),
    ).not.toBeNull();
    expect(runtime.applyStaging).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lightRig: expect.objectContaining({
          lights: expect.arrayContaining([
            expect.objectContaining({
              id: 'light-overhead',
              position: { x: 0, y: 4, z: 0.5 },
            }),
          ]),
        }),
      }),
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add 720° environment"]')
        ?.click();
    });
    expect(mockWindow.api.postedMessages).toContainEqual({
      type: '3d-reference/panorama-picker-requested',
      identity: { sessionId: 'session-1', revision: 2 },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add or replace mannequin"]')
        ?.click();
      await Promise.resolve();
    });
    const malePreset = document.body.querySelector<HTMLButtonElement>(
      'button[data-preset-id="guide-mannequin-male"]',
    );
    expect(malePreset).not.toBeNull();
    await act(async () => malePreset?.click());
    expect(mockWindow.api.postedMessages).toContainEqual({
      type: '3d-reference/preset-subject-requested',
      identity: { sessionId: 'session-1', revision: 2 },
      presetId: 'guide-mannequin-male',
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Add or replace object"]')
        ?.click();
      await Promise.resolve();
    });
    const objectPresetIds = [
      'guide-blockout-cube',
      'guide-blockout-sphere',
      'guide-blockout-cylinder',
    ];
    expect(
      objectPresetIds.map((presetId) =>
        document.body.querySelector<HTMLButtonElement>(`button[data-preset-id="${presetId}"]`),
      ),
    ).not.toContain(null);
    expect(
      document.body.querySelector('button[data-preset-id="guide-primitive-blockout-props"]'),
    ).toBeNull();
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>('button[data-preset-id="guide-blockout-sphere"]')
        ?.click(),
    );
    expect(mockWindow.api.postedMessages).toContainEqual({
      type: '3d-reference/preset-subject-requested',
      identity: { sessionId: 'session-1', revision: 2 },
      presetId: 'guide-blockout-sphere',
    });

    await act(async () => root.unmount());
    mockWindow.dispose();
  });

  it('reports a lost WebGL renderer as a fatal session diagnostic', async () => {
    const mockWindow = installMockWebviewWindow();
    const runtime = fakeRuntime();
    let callbacks: ThreeModelRuntimeCallbacks | undefined;
    const container = document.createElement('div');
    document.body.append(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider service={i18nService}>
          <ModelViewer
            runtimeFactory={{
              create: vi.fn((_canvas, nextCallbacks) => {
                callbacks = nextCallbacks;
                return runtime.value;
              }),
            }}
            sessionId="session-lost"
          />
        </I18nProvider>,
      );
    });
    await act(async () => callbacks?.onRendererLost?.());
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.viewerStatus',
      'error',
    );
    expect(mockWindow.api.postedMessages).toContainEqual({
      type: '3d-reference/diagnostic',
      diagnostic: expect.objectContaining({ code: 'renderer-lost', severity: 'error' }),
    });
    await act(async () => root.unmount());
    mockWindow.dispose();
  });

  it('switches scene, camera, light, and node inspectors while staging stays temporary', async () => {
    const mockWindow = installMockWebviewWindow();
    const runtime = fakeRuntime();
    let callbacks: ThreeModelRuntimeCallbacks | undefined;
    const factory: ThreeModelRuntimeFactory = {
      create: vi.fn((_canvas, nextCallbacks) => {
        callbacks = nextCallbacks;
        return runtime.value;
      }),
    };
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
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: loadMessage() }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="model-preview-inspector"]')).toHaveProperty(
      'dataset.inspectorKind',
      'scene',
    );
    const lightRow = container.querySelector<HTMLElement>(
      '[data-tree-item-id="model-selection:light:key"]',
    );
    expect(lightRow).not.toBeNull();
    await act(async () => lightRow?.click());
    expect(container.querySelector('[data-testid="model-preview-inspector"]')).toHaveProperty(
      'dataset.inspectorKind',
      'light',
    );
    expect(container.querySelector('[data-testid="model-preview-light-inspector"]')).not.toBeNull();
    expect(runtime.setLightGuide).toHaveBeenLastCalledWith('key');
    expect(runtime.setTransformEnabled).toHaveBeenLastCalledWith(false);
    expect(runtime.setDirectDragEnabled).toHaveBeenLastCalledWith(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Move"]')?.disabled).toBe(
      true,
    );
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="Rotate"]')?.disabled,
    ).toBe(true);
    await act(async () => {
      callbacks?.onLightPositionChanged?.('key', { x: 2, y: 3, z: 4 });
    });
    expect(runtime.applyStaging).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 1,
        lightRig: expect.objectContaining({
          lights: expect.arrayContaining([
            expect.objectContaining({ id: 'key', position: { x: 2, y: 3, z: 4 } }),
          ]),
        }),
      }),
    );

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: loadMessage() }));
      await Promise.resolve();
    });
    expect(runtime.setLightGuide).toHaveBeenLastCalledWith(undefined);
    runtime.setCameraGuide.mockClear();
    const cameraRow = container.querySelector<HTMLElement>(
      '[data-tree-item-id="model-selection:camera:camera-default"]',
    );
    expect(cameraRow).not.toBeNull();
    await act(async () => cameraRow?.click());
    expect(container.querySelector('[data-testid="model-preview-inspector"]')).toHaveProperty(
      'dataset.inspectorKind',
      'camera',
    );
    expect(
      container.querySelector('[data-testid="model-preview-camera-inspector"]'),
    ).not.toBeNull();
    expect(container.querySelectorAll('.model-preview__axis-group')).toHaveLength(2);
    expect(runtime.setCameraGuide).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'camera-default' }),
    );
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.stagingRevision',
      '0',
    );
    expect(runtime.setTransformEnabled).toHaveBeenLastCalledWith(false);
    expect(runtime.setDirectDragEnabled).toHaveBeenLastCalledWith(true);
    await act(async () => {
      callbacks?.onCameraPositionChanged?.('camera-default', { x: 1, y: 2, z: 3 });
    });
    expect(runtime.applyStaging).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 1,
        cameraPresets: expect.arrayContaining([
          expect.objectContaining({ id: 'camera-default', position: { x: 1, y: 2, z: 3 } }),
        ]),
      }),
    );

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: loadMessage() }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.selectionKind',
      'scene',
    );
    expect(container.querySelector('[data-testid="model-preview-inspector"]')).toHaveProperty(
      'dataset.inspectorKind',
      'scene',
    );

    await act(async () => cameraRow?.click());

    const cameraName = container.querySelector<HTMLInputElement>('input[aria-label="Camera name"]');
    await act(async () => {
      cameraName?.focus();
      setTextInputValue(cameraName, 'Portrait');
      cameraName?.blur();
    });
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.stagingRevision',
      '1',
    );
    expect(runtime.frameCamera).not.toHaveBeenCalled();
    expect(runtime.setCameraGuide).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'camera-default', label: 'Portrait' }),
    );

    const cameraInspector = container.querySelector(
      '[data-testid="model-preview-camera-inspector"]',
    );
    const duplicateButton = [...(cameraInspector?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.trim() === 'Duplicate',
    );
    await act(async () => duplicateButton?.click());
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.stagingRevision',
      '2',
    );
    expect(container.textContent).toContain('Portrait Copy');

    const viewButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'View through camera',
    );
    await act(async () => viewButton?.click());
    expect(runtime.frameCamera).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'camera-default-copy' }),
    );
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toHaveProperty(
      'dataset.activeCameraId',
      'camera-default-copy',
    );

    const removeButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Remove',
    );
    await act(async () => removeButton?.click());
    expect(container.querySelector('[data-testid="model-preview-ready"]')).toMatchObject({
      dataset: expect.objectContaining({
        activeCameraId: 'camera-default',
        selectionKind: 'camera',
      }),
    });

    const nodeRow = container.querySelector<HTMLElement>(
      '[data-tree-item-id="model-selection:node:root/0:mesh"]',
    );
    await act(async () => nodeRow?.click());
    expect(container.querySelector('[data-testid="model-preview-node-inspector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-preview-inspector"]')).toHaveProperty(
      'dataset.inspectorKind',
      'node',
    );

    const sceneRow = container.querySelector<HTMLElement>(
      '[data-tree-item-id="model-selection:scene"]',
    );
    await act(async () => sceneRow?.click());
    expect(container.querySelector('[data-testid="model-preview-scene-inspector"]')).not.toBeNull();
    expect(runtime.setCameraGuide).toHaveBeenLastCalledWith(undefined);

    await act(async () => root.unmount());
    mockWindow.dispose();
  });

  it('keeps independent runtime roots and ignores removed legacy capture messages', async () => {
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
    expect(second.capture).not.toHaveBeenCalled();
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
  const loadPreset = vi.fn(async () => facts);
  const applyReferencePose = vi.fn();
  const applyStaging = vi.fn();
  const capture = vi.fn(() => 'data:image/png;base64,AA==');
  const dispose = vi.fn();
  const frameModel = vi.fn();
  const frameCamera = vi.fn();
  const setCameraGuide = vi.fn();
  const setDirectDragEnabled = vi.fn();
  const setLightGuide = vi.fn();
  const setGroundGridVisible = vi.fn();
  const setPanoramaEnvironment = vi.fn(async () => undefined);
  const capturePurpose = vi.fn(() => 'data:image/png;base64,AA==');
  const resize = vi.fn();
  const value: ThreeModelRuntimePort = {
    load,
    loadPreset,
    applyReferencePose,
    setPanoramaEnvironment,
    clearPanoramaEnvironment: vi.fn(),
    capturePurpose,
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
    setGroundGridVisible,
    setCameraGuide,
    setDirectDragEnabled,
    setLightGuide,
    frameCamera,
    frameModel,
    resize,
    capture,
    dispose,
  };
  return {
    value,
    load,
    loadPreset,
    applyReferencePose,
    applyStaging,
    capture,
    dispose,
    frameCamera,
    frameModel,
    setCameraGuide,
    setDirectDragEnabled,
    setLightGuide,
    setTransformEnabled: value.setTransformEnabled,
    setTransformMode: value.setTransformMode,
    setGroundGridVisible,
    setPanoramaEnvironment,
    capturePurpose,
    resize,
  };
}

function loadMessage() {
  const source = createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: 'model.glb' },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'fingerprint-1' }),
  });
  return {
    type: '3d-reference/session-init' as const,
    protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
    panelSubject: {
      kind: 'source-model' as const,
      subject: {
        kind: 'source-model' as const,
        source,
        fingerprint: 'fingerprint-1',
        format: 'glb' as const,
      },
      runtime: {
        source,
        fingerprint: 'fingerprint-1',
        format: 'glb' as const,
        entryUri: 'webview:model.glb',
        uriMap: { 'model.glb': 'webview:model.glb' },
        sizeBytes: 12,
      },
    },
    availablePresets: referencePresetOptions(),
    eligiblePurposes: ['appearance', 'camera'] as const,
    staging: {
      schemaVersion: THREE_REFERENCE_STAGING_SCHEMA_VERSION,
      sessionId: 'session-1',
      revision: 0,
      subject: {
        kind: 'source-model' as const,
        source,
        fingerprint: 'fingerprint-1',
        format: 'glb' as const,
      },
      selectedPurposes: ['appearance', 'camera'] as const,
      camera: {
        cameraId: 'camera-default',
        position: { x: 3, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
        aspectRatio: 1,
      },
    },
  };
}

function builtinPresetMessage() {
  return {
    type: '3d-reference/session-init' as const,
    protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
    panelSubject: {
      kind: 'builtin-preset' as const,
      subject: {
        kind: 'builtin-preset' as const,
        presetId: 'guide-mannequin-female',
        presetVersion: 1,
        fingerprint: 'sha256:neutral',
        presetKind: 'mannequin' as const,
        appearancePolicy: 'guide-only' as const,
        allowedPurposes: ['pose', 'camera'] as const,
      },
      runtime: {
        kind: 'procedural' as const,
        implementationId: 'neutral-mannequin-female-v2',
        poseCapabilities: {
          posePresets: [
            {
              poseId: 'standing',
              labelKey: 'preview.model.posePreset.standing',
              joints: [
                { jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } },
                { jointId: 'spine', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } },
              ],
            },
            {
              poseId: 'walking',
              labelKey: 'preview.model.posePreset.walking',
              joints: [
                { jointId: 'hips', rotation: { x: 0.04, y: 0.08, z: 0, order: 'XYZ' } },
                { jointId: 'spine', rotation: { x: -0.06, y: 0, z: 0, order: 'XYZ' } },
              ],
            },
          ],
          joints: [
            {
              jointId: 'hips',
              rotationConstraint: {
                min: { x: -0.5, y: -0.5, z: -0.5 },
                max: { x: 0.5, y: 0.5, z: 0.5 },
              },
            },
            {
              jointId: 'spine',
              rotationConstraint: {
                min: { x: -0.5, y: -0.5, z: -0.5 },
                max: { x: 0.5, y: 0.5, z: 0.5 },
              },
            },
          ],
        },
      },
    },
    availablePresets: referencePresetOptions(),
    eligiblePurposes: ['pose', 'camera'] as const,
    staging: {
      schemaVersion: THREE_REFERENCE_STAGING_SCHEMA_VERSION,
      sessionId: 'session-guide',
      revision: 0,
      subject: {
        kind: 'builtin-preset' as const,
        presetId: 'guide-mannequin-female',
        presetVersion: 1,
        fingerprint: 'sha256:neutral',
        presetKind: 'mannequin' as const,
        appearancePolicy: 'guide-only' as const,
        allowedPurposes: ['pose', 'camera'] as const,
      },
      selectedPurposes: ['pose', 'camera'] as const,
      camera: {
        cameraId: 'camera-front',
        position: { x: 0, y: 0.15, z: 3.5 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
        aspectRatio: 1,
      },
      pose: { poseId: 'standing', joints: [] },
    },
  };
}

function referencePresetOptions() {
  return [
    {
      presetId: 'guide-mannequin-female',
      presetKind: 'mannequin' as const,
      labelKey: 'preview.threeReference.preset.femaleMannequin',
    },
    {
      presetId: 'guide-mannequin-male',
      presetKind: 'mannequin' as const,
      labelKey: 'preview.threeReference.preset.maleMannequin',
    },
    {
      presetId: 'guide-blockout-cube',
      presetKind: 'prop' as const,
      labelKey: 'preview.threeReference.preset.blockoutCube',
    },
    {
      presetId: 'guide-blockout-sphere',
      presetKind: 'prop' as const,
      labelKey: 'preview.threeReference.preset.blockoutSphere',
    },
    {
      presetId: 'guide-blockout-cylinder',
      presetKind: 'prop' as const,
      labelKey: 'preview.threeReference.preset.blockoutCylinder',
    },
  ];
}

function panoramaEnvironmentMessage(load: ReturnType<typeof loadMessage>) {
  const source = createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: 'scene_360.png' },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'panorama-1' }),
  });
  const environment = {
    source,
    fingerprint: 'panorama-1',
    orientation: { yawDeg: 15, pitchDeg: -5, fieldOfViewDeg: 75 },
  };
  return {
    type: '3d-reference/environment-runtime' as const,
    identity: { sessionId: 'session-1', revision: 1 },
    staging: {
      ...load.staging,
      revision: 1,
      environment,
    },
    runtime: {
      source,
      fingerprint: 'panorama-1',
      uri: 'webview:scene_360.png',
      mediaType: 'image/png' as const,
      sizeBytes: 1024,
    },
  };
}

function setTextInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
