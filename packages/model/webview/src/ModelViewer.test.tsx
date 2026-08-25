// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelViewerHostPort } from './modelViewerHost';
import type { ThreeModelRuntimeFactory, ThreeModelRuntimePort } from './threeRuntime';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ModelViewer } from './ModelViewer';

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ModelViewer', () => {
  it('contains an invalid Host message to the addressed panel', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const invalidPanel = createHost();
    const siblingPanel = createHost();
    const invalidContainer = document.createElement('div');
    const siblingContainer = document.createElement('div');
    document.body.append(invalidContainer, siblingContainer);
    const invalidRoot = createRoot(invalidContainer);
    const siblingRoot = createRoot(siblingContainer);
    roots.push(invalidRoot, siblingRoot);

    await act(async () => {
      invalidRoot.render(
        <ModelViewer
          host={invalidPanel.host}
          runtimeFactory={createRuntimeFactory()}
          sessionId="panel-invalid"
        />,
      );
      siblingRoot.render(
        <ModelViewer
          host={siblingPanel.host}
          runtimeFactory={createRuntimeFactory()}
          sessionId="panel-sibling"
        />,
      );
    });

    await act(async () => {
      invalidPanel.emit({ type: '3d-reference/session-init', obsoleteField: 2 });
    });

    expect(
      invalidContainer
        .querySelector('[data-testid="model-preview-ready"]')
        ?.getAttribute('data-viewer-status'),
    ).toBe('error');
    expect(invalidContainer.querySelector('[role="alert"]')?.textContent).toContain(
      'invalid panel message',
    );
    expect(invalidPanel.postMessage).toHaveBeenLastCalledWith({
      type: '3d-reference/diagnostic',
      identity: { sessionId: 'panel-invalid', requestId: expect.any(String) },
      diagnostic: {
        code: 'message-invalid',
        message: 'Model Preview received an invalid panel message.',
        severity: 'error',
        identity: { sessionId: 'panel-invalid' },
      },
    });

    await act(async () => {
      invalidPanel.emit({
        type: '3d-reference/cancel',
        identity: { sessionId: 'panel-sibling', requestId: 'foreign-request' },
        reason: 'foreign cancellation',
      });
    });

    expect(invalidPanel.postMessage).toHaveBeenLastCalledWith({
      type: '3d-reference/diagnostic',
      identity: { sessionId: 'panel-invalid', requestId: expect.any(String) },
      diagnostic: {
        code: 'session-mismatch',
        message: '3D Reference message belongs to another Preview panel.',
        severity: 'error',
        identity: { sessionId: 'panel-invalid' },
      },
    });
    expect(
      siblingContainer
        .querySelector('[data-testid="model-preview-ready"]')
        ?.getAttribute('data-viewer-status'),
    ).toBe('waiting');
    expect(siblingPanel.postMessage).toHaveBeenCalledOnce();
    expect(siblingPanel.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: '3d-reference/diagnostic' }),
    );
  });
});

function createHost(): {
  readonly host: ModelViewerHostPort;
  readonly postMessage: ReturnType<typeof vi.fn>;
  readonly emit: (message: unknown) => void;
} {
  let listener: ((message: unknown) => void) | undefined;
  const postMessage = vi.fn();
  return {
    host: {
      postMessage,
      getState: () => undefined,
      setState: vi.fn(),
      subscribe(nextListener) {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      },
    },
    postMessage,
    emit(message) {
      if (!listener) throw new Error('Model Viewer Host listener is unavailable.');
      listener(message);
    },
  };
}

function createRuntimeFactory(): ThreeModelRuntimeFactory {
  return {
    create(): ThreeModelRuntimePort {
      return {
        load: vi.fn(),
        loadPreset: vi.fn(),
        applyReferencePose: vi.fn(),
        setPanoramaEnvironment: vi.fn(),
        clearPanoramaEnvironment: vi.fn(),
        capturePurpose: vi.fn(),
        applyStaging: vi.fn(),
        getNodes: vi.fn(() => []),
        setTransformMode: vi.fn(),
        setTransformEnabled: vi.fn(),
        setDirectDragEnabled: vi.fn(),
        setGroundGridVisible: vi.fn(),
        setCameraGuide: vi.fn(),
        setLightGuide: vi.fn(),
        frameCamera: vi.fn(),
        frameModel: vi.fn(),
        resize: vi.fn(),
        capture: vi.fn(),
        dispose: vi.fn(),
      };
    },
  };
}
