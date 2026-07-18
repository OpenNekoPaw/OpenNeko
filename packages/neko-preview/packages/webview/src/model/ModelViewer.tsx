import { useEffect, useMemo, useRef, useState } from 'react';
import {
  isModelPreviewIdentity,
  isModelPreviewStagingState,
  isResourceRef,
  type ModelPreviewCaptureResult,
  type ModelPreviewDiagnostic,
  type ModelPreviewExtensionMessage,
  type ModelPreviewIdentity,
  type ModelPreviewSourceDescriptor,
  type ModelPreviewStagingState,
  type NormalizedModelFacts,
} from '@neko/shared';
import { useTranslation } from '../i18n/I18nContext';
import { getVscodeApi } from '../shared/vscodeApi';
import {
  browserThreeRuntimeFactory,
  DEFAULT_MODEL_VIEW_STATE,
  type ModelPreviewNode,
  type ModelViewState,
  type ThreeModelRuntimeFactory,
  type ThreeModelRuntimePort,
} from './threeRuntime';
import { patchModelTransform, selectModelNode } from './modelStagingStore';
import { ModelInspectorPanel } from './components/ModelInspectorPanel';
import { ModelScenePanel } from './components/ModelScenePanel';
import { ModelOrientationGizmo } from './components/ModelOrientationGizmo';
import {
  ModelViewportControls,
  type ModelTransformMode,
  type ModelViewportMode,
} from './components/ModelViewportControls';

export interface ModelViewerProps {
  readonly runtimeFactory?: ThreeModelRuntimeFactory;
  readonly sessionId?: string;
}

type ViewerStatus = 'waiting' | 'loading' | 'ready' | 'error';
type DeliveryStatus = 'idle' | 'sending' | 'succeeded' | 'error';

export function ModelViewer({
  runtimeFactory = browserThreeRuntimeFactory,
  sessionId: sessionIdOverride,
}: ModelViewerProps): React.JSX.Element {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<ThreeModelRuntimePort | undefined>(undefined);
  const sourceRef = useRef<ModelPreviewSourceDescriptor | undefined>(undefined);
  const factsRef = useRef<NormalizedModelFacts | undefined>(undefined);
  const stagingRef = useRef<ModelPreviewStagingState | undefined>(undefined);
  const [status, setStatus] = useState<ViewerStatus>('waiting');
  const [staging, setStaging] = useState<ModelPreviewStagingState>();
  const [facts, setFacts] = useState<NormalizedModelFacts>();
  const [nodes, setNodes] = useState<readonly ModelPreviewNode[]>([]);
  const [diagnostic, setDiagnostic] = useState<ModelPreviewDiagnostic>();
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('idle');
  const [transformMode, setTransformMode] = useState<ModelTransformMode>('translate');
  const [viewportMode, setViewportMode] = useState<ModelViewportMode>('navigate');
  const [gridVisible, setGridVisible] = useState(true);
  const [axesVisible, setAxesVisible] = useState(true);
  const [viewState, setViewState] = useState<ModelViewState>(DEFAULT_MODEL_VIEW_STATE);
  const sessionId = sessionIdOverride ?? document.body.dataset.modelSessionId;
  const vscode = useMemo(() => getVscodeApi(), []);

  useEffect(() => {
    stagingRef.current = staging;
    if (staging) runtimeRef.current?.applyStaging(staging);
  }, [staging]);

  useEffect(() => {
    runtimeRef.current?.setTransformEnabled(viewportMode === 'inspect');
  }, [viewportMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!sessionId) {
      setStatus('error');
      setDiagnostic({
        code: 'protocol-mismatch',
        message: 'Model Preview Webview started without a session identity.',
        severity: 'error',
      });
      return;
    }
    const runtime = runtimeFactory.create(canvas, {
      onTransformChanged(nodePath, transform) {
        setStaging((current) => {
          if (!current) return current;
          const next = patchModelTransform(current, nodePath, transform);
          stagingRef.current = next;
          postState(vscode, next);
          return next;
        });
      },
      onViewChanged: setViewState,
      onDiagnostic(message) {
        setDiagnostic({ code: 'load-failed', message, severity: 'error' });
      },
    });
    runtimeRef.current = runtime;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      runtime.resize(Math.max(1, Math.floor(bounds.width)), Math.max(1, Math.floor(bounds.height)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const onMessage = (event: MessageEvent<unknown>) => {
      const message = parseExtensionMessage(event.data);
      if (!message) return;
      void handleExtensionMessage({
        message,
        runtime,
        sessionId,
        vscode,
        setStatus,
        setStaging,
        setFacts,
        setNodes,
        setDiagnostic,
        setDeliveryStatus,
        sourceRef,
        factsRef,
        stagingRef,
      });
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({
      type: 'model-preview/ready',
      protocolVersion: 1,
      sessionId,
    });
    return () => {
      observer.disconnect();
      window.removeEventListener('message', onMessage);
      runtime.dispose();
      runtimeRef.current = undefined;
    };
  }, [runtimeFactory, sessionId, vscode]);

  const updateStaging = (next: ModelPreviewStagingState) => {
    stagingRef.current = next;
    setStaging(next);
    setDeliveryStatus('idle');
    setDiagnostic((current) => (isDeliveryDiagnostic(current) ? undefined : current));
    postState(vscode, next);
  };
  const controlsDisabled = !staging || status !== 'ready';

  return (
    <main
      className="model-preview"
      aria-label={t('preview.model.title')}
      data-testid="model-preview-ready"
      data-viewer-status={status}
      data-mesh-count={facts?.meshCount ?? 0}
      data-active-camera-id={staging?.activeCameraId ?? ''}
      data-key-light-intensity={
        staging?.lightRig.lights.find((light) => light.id === 'key')?.intensity ?? ''
      }
      data-staging-revision={staging?.revision ?? 0}
      data-delivery-status={deliveryStatus}
      data-view-distance={viewState.distance}
      data-view-target={`${viewState.target.x},${viewState.target.y},${viewState.target.z}`}
    >
      <ModelScenePanel
        disabled={controlsDisabled}
        nodes={nodes}
        selectedNodePath={staging?.selectedNodePath}
        onSelectNode={(nodePath) => {
          if (!staging) return;
          updateStaging(selectModelNode(staging, nodePath));
          setViewportMode('inspect');
        }}
      />
      <section className="model-preview__viewport" aria-label={t('preview.model.viewport')}>
        <canvas ref={canvasRef} tabIndex={0} aria-label={t('preview.model.canvas')} />
        {axesVisible ? (
          <ModelOrientationGizmo
            disabled={controlsDisabled}
            orientation={viewState.orientation}
            onResetView={() => runtimeRef.current?.frameModel()}
          />
        ) : null}
        <ModelViewportControls
          axesVisible={axesVisible}
          disabled={controlsDisabled}
          gridVisible={gridVisible}
          hasSelection={staging?.selectedNodePath !== undefined}
          viewportMode={viewportMode}
          transformMode={transformMode}
          onAxesVisibleChange={setAxesVisible}
          onGridVisibleChange={(visible) => {
            runtimeRef.current?.setGroundGridVisible(visible);
            setGridVisible(visible);
          }}
          onViewportModeChange={setViewportMode}
          onTransformModeChange={(mode) => {
            runtimeRef.current?.setTransformMode(mode);
            setTransformMode(mode);
          }}
          onFrameModel={() => runtimeRef.current?.frameModel()}
        />
        {status !== 'ready' ? (
          <div className="model-preview__overlay" role={status === 'error' ? 'alert' : 'status'}>
            {status === 'loading'
              ? t('preview.model.loading')
              : status === 'error'
                ? (diagnostic?.message ?? t('preview.model.error'))
                : t('preview.model.waiting')}
          </div>
        ) : null}
      </section>
      <ModelInspectorPanel
        deliveryStatus={deliveryStatus}
        diagnostic={status === 'ready' ? diagnostic : undefined}
        disabled={controlsDisabled || deliveryStatus === 'sending'}
        facts={facts}
        nodes={nodes}
        staging={staging}
        onUpdateStaging={updateStaging}
        onSendToAgent={() => {
          if (!staging) return;
          setDeliveryStatus('sending');
          vscode.postMessage({
            type: 'model-preview/send-requested',
            identity: identityOf(staging),
          });
        }}
      />
    </main>
  );
}

async function handleExtensionMessage(input: {
  readonly message: ModelPreviewExtensionMessage;
  readonly runtime: ThreeModelRuntimePort;
  readonly sessionId: string;
  readonly vscode: ReturnType<typeof getVscodeApi>;
  readonly setStatus: (status: ViewerStatus) => void;
  readonly setStaging: (state: ModelPreviewStagingState) => void;
  readonly setFacts: (facts: NormalizedModelFacts) => void;
  readonly setNodes: (nodes: readonly ModelPreviewNode[]) => void;
  readonly setDiagnostic: (diagnostic: ModelPreviewDiagnostic | undefined) => void;
  readonly setDeliveryStatus: (status: DeliveryStatus) => void;
  readonly sourceRef: React.MutableRefObject<ModelPreviewSourceDescriptor | undefined>;
  readonly factsRef: React.MutableRefObject<NormalizedModelFacts | undefined>;
  readonly stagingRef: React.MutableRefObject<ModelPreviewStagingState | undefined>;
}): Promise<void> {
  const { message } = input;
  try {
    switch (message.type) {
      case 'model-preview/load': {
        if (message.staging.sessionId !== input.sessionId) {
          throw new Error('Model Preview load identity does not match this Webview.');
        }
        input.setStatus('loading');
        input.setDiagnostic(undefined);
        input.setDeliveryStatus('idle');
        input.sourceRef.current = message.source;
        input.stagingRef.current = message.staging;
        input.setStaging(message.staging);
        const facts = await input.runtime.load(message.source);
        input.runtime.applyStaging(message.staging);
        input.factsRef.current = facts;
        input.setFacts(facts);
        input.setNodes(input.runtime.getNodes());
        input.setStatus('ready');
        input.vscode.postMessage({
          type: 'model-preview/load-completed',
          identity: identityOf(message.staging),
          facts,
        });
        break;
      }
      case 'model-preview/capture-requested': {
        const staging = input.stagingRef.current;
        const facts = input.factsRef.current;
        if (!staging || !facts || !sameIdentity(message.identity, identityOf(staging))) {
          throw new Error('Model Preview capture identity is stale.');
        }
        const dataUrl = input.runtime.capture(message.settings);
        const capture: ModelPreviewCaptureResult = {
          metadata: {
            ...message.identity,
            mimeType: 'image/png',
            width: message.settings.width,
            height: message.settings.height,
            cameraId: staging.activeCameraId,
          },
          dataUrl,
          staging,
          facts,
        };
        input.vscode.postMessage({
          type: 'model-preview/capture-completed',
          requestId: message.requestId,
          capture,
        });
        break;
      }
      case 'model-preview/send-succeeded':
        if (!sameIdentity(message.identity, identityOfRequired(input.stagingRef.current))) {
          throw new Error('Model Preview send acknowledgement is stale.');
        }
        input.setDiagnostic({
          code: 'delivery-succeeded',
          message: 'Model Preview context sent to Agent.',
          severity: 'info',
          identity: message.identity,
        });
        input.setDeliveryStatus('succeeded');
        break;
      case 'model-preview/diagnostic':
        input.setDiagnostic(message.diagnostic);
        if (message.diagnostic.severity === 'error') {
          input.setDeliveryStatus('error');
          if (isViewerFatalDiagnostic(message.diagnostic.code)) {
            input.setStatus('error');
          }
        }
        break;
    }
  } catch (error) {
    const diagnostic: ModelPreviewDiagnostic = {
      code:
        message.type === 'model-preview/capture-requested'
          ? 'capture-failed'
          : message.type === 'model-preview/send-succeeded'
            ? 'stale-revision'
            : 'load-failed',
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
      identity: input.stagingRef.current
        ? identityOf(input.stagingRef.current)
        : { sessionId: input.sessionId },
    };
    input.setDiagnostic(diagnostic);
    input.setDeliveryStatus('error');
    if (isViewerFatalDiagnostic(diagnostic.code)) {
      input.setStatus('error');
    }
    input.vscode.postMessage({ type: 'model-preview/diagnostic', diagnostic });
  }
}

function isViewerFatalDiagnostic(code: ModelPreviewDiagnostic['code']): boolean {
  switch (code) {
    case 'capture-invalid':
    case 'capture-failed':
    case 'context-invalid':
    case 'agent-unavailable':
    case 'agent-rejected':
    case 'delivery-succeeded':
    case 'stale-revision':
      return false;
    case 'unsupported-format':
    case 'source-missing':
    case 'source-unauthorized':
    case 'source-too-large':
    case 'mime-mismatch':
    case 'unsafe-dependency':
    case 'missing-dependency':
    case 'dependency-limit-exceeded':
    case 'protocol-mismatch':
    case 'session-mismatch':
    case 'stale-state':
    case 'load-failed':
    case 'empty-model':
    case 'renderer-unavailable':
    case 'renderer-lost':
    case 'disposed':
      return true;
  }
}

function isDeliveryDiagnostic(diagnostic: ModelPreviewDiagnostic | undefined): boolean {
  if (!diagnostic) return false;
  return !isViewerFatalDiagnostic(diagnostic.code);
}

function postState(
  vscode: ReturnType<typeof getVscodeApi>,
  staging: ModelPreviewStagingState,
): void {
  vscode.setState({ modelPreviewStaging: staging });
  vscode.postMessage({ type: 'model-preview/state-changed', staging });
}

function identityOf(staging: ModelPreviewStagingState): ModelPreviewIdentity {
  return {
    sessionId: staging.sessionId,
    sourceFingerprint: staging.sourceFingerprint,
    revision: staging.revision,
  };
}

function identityOfRequired(staging: ModelPreviewStagingState | undefined): ModelPreviewIdentity {
  if (!staging) throw new Error('Model Preview staging is unavailable.');
  return identityOf(staging);
}

function sameIdentity(left: ModelPreviewIdentity, right: ModelPreviewIdentity): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.sourceFingerprint === right.sourceFingerprint &&
    left.revision === right.revision
  );
}

function parseExtensionMessage(value: unknown): ModelPreviewExtensionMessage | undefined {
  if (!isRecord(value) || typeof value['type'] !== 'string') return undefined;
  switch (value['type']) {
    case 'model-preview/load':
      return isSourceDescriptor(value['source']) && isModelPreviewStagingState(value['staging'])
        ? { type: 'model-preview/load', source: value['source'], staging: value['staging'] }
        : undefined;
    case 'model-preview/capture-requested':
      return typeof value['requestId'] === 'string' &&
        value['requestId'].length > 0 &&
        isModelPreviewIdentity(value['identity']) &&
        isCaptureSettings(value['settings'])
        ? {
            type: 'model-preview/capture-requested',
            requestId: value['requestId'],
            identity: value['identity'],
            settings: value['settings'],
          }
        : undefined;
    case 'model-preview/send-succeeded':
      return isModelPreviewIdentity(value['identity'])
        ? { type: 'model-preview/send-succeeded', identity: value['identity'] }
        : undefined;
    case 'model-preview/diagnostic':
      return isDiagnostic(value['diagnostic'])
        ? { type: 'model-preview/diagnostic', diagnostic: value['diagnostic'] }
        : undefined;
    default:
      return undefined;
  }
}

function isSourceDescriptor(value: unknown): value is ModelPreviewSourceDescriptor {
  if (!isRecord(value)) return false;
  return (
    value['protocolVersion'] === 1 &&
    isResourceRef(value['source']) &&
    typeof value['sourceFingerprint'] === 'string' &&
    (value['format'] === 'glb' ||
      value['format'] === 'gltf' ||
      value['format'] === 'obj' ||
      value['format'] === 'stl' ||
      value['format'] === 'ply') &&
    typeof value['entryUri'] === 'string' &&
    isStringRecord(value['uriMap']) &&
    typeof value['sizeBytes'] === 'number'
  );
}

function isCaptureSettings(
  value: unknown,
): value is { readonly width: number; readonly height: number } {
  return (
    isRecord(value) &&
    Number.isInteger(value['width']) &&
    typeof value['width'] === 'number' &&
    Number.isInteger(value['height']) &&
    typeof value['height'] === 'number'
  );
}

function isDiagnostic(value: unknown): value is ModelPreviewDiagnostic {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error')
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
