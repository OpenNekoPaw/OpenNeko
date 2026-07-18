import { useEffect, useMemo, useRef, useState } from 'react';
import {
  THREE_REFERENCE_PROTOCOL_VERSION,
  isThreeReferenceDiagnostic,
  isThreeReferenceIdentity,
  isThreeReferencePanoramaRuntimeDescriptor,
  isThreeReferencePanelSubject,
  isThreeReferencePurpose,
  isThreeReferenceStagingSnapshot,
  type ModelPreviewDiagnostic,
  type ModelPreviewSourceDescriptor,
  type ModelPreviewStagingState,
  type NormalizedModelFacts,
  type ThreeReferenceExtensionMessage,
  type ThreeReferencePanelSubject,
  type ThreeReferenceStagingSnapshot,
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
import {
  duplicateModelCamera,
  patchModelTransform,
  removeModelCamera,
  selectModelCamera,
  selectModelNode,
} from './modelStagingStore';
import type { ModelSceneSelection } from './modelSceneSelection';
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

export function ModelViewer({
  runtimeFactory = browserThreeRuntimeFactory,
  sessionId: sessionIdOverride,
}: ModelViewerProps): React.JSX.Element {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<ThreeModelRuntimePort | undefined>(undefined);
  const stagingRef = useRef<ModelPreviewStagingState | undefined>(undefined);
  const referenceStagingRef = useRef<ThreeReferenceStagingSnapshot | undefined>(undefined);
  const [status, setStatus] = useState<ViewerStatus>('waiting');
  const [staging, setStaging] = useState<ModelPreviewStagingState>();
  const [facts, setFacts] = useState<NormalizedModelFacts>();
  const [nodes, setNodes] = useState<readonly ModelPreviewNode[]>([]);
  const [diagnostic, setDiagnostic] = useState<ModelPreviewDiagnostic>();
  const [transformMode, setTransformMode] = useState<ModelTransformMode>('translate');
  const [viewportMode, setViewportMode] = useState<ModelViewportMode>('navigate');
  const [gridVisible, setGridVisible] = useState(true);
  const [axesVisible, setAxesVisible] = useState(true);
  const [viewState, setViewState] = useState<ModelViewState>(DEFAULT_MODEL_VIEW_STATE);
  const [sceneSelection, setSceneSelection] = useState<ModelSceneSelection>({ kind: 'scene' });
  const sessionId = sessionIdOverride ?? document.body.dataset.modelSessionId;
  const vscode = useMemo(() => getVscodeApi(), []);

  useEffect(() => {
    stagingRef.current = staging;
    if (staging) runtimeRef.current?.applyStaging(staging);
  }, [staging]);

  useEffect(() => {
    runtimeRef.current?.setTransformEnabled(
      viewportMode === 'inspect' && sceneSelection.kind === 'node',
    );
  }, [sceneSelection.kind, viewportMode]);

  useEffect(() => {
    const camera =
      sceneSelection.kind === 'camera'
        ? staging?.cameraPresets.find((preset) => preset.id === sceneSelection.cameraId)
        : undefined;
    runtimeRef.current?.setCameraGuide(camera);
  }, [sceneSelection, staging]);

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
          const referenceStaging = referenceStagingRef.current;
          if (!referenceStaging) throw new Error('3D Reference staging is unavailable.');
          referenceStagingRef.current = postState(vscode, next, referenceStaging);
          return next;
        });
      },
      onViewChanged: setViewState,
      onDiagnostic(message) {
        setDiagnostic({ code: 'load-failed', message, severity: 'error' });
      },
      onRendererLost() {
        const diagnostic = {
          code: 'renderer-lost' as const,
          message: 'The 3D Reference renderer context was lost.',
          severity: 'error' as const,
          identity: { sessionId },
        };
        setDiagnostic(diagnostic);
        setStatus('error');
        vscode.postMessage({ type: '3d-reference/diagnostic', diagnostic });
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
        setSceneSelection,
        setDiagnostic,
        stagingRef,
        referenceStagingRef,
      });
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({
      type: '3d-reference/ready',
      protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
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
    const referenceStaging = referenceStagingRef.current;
    if (!referenceStaging) throw new Error('3D Reference staging is unavailable.');
    referenceStagingRef.current = postState(vscode, next, referenceStaging);
  };
  const controlsDisabled = !staging || status !== 'ready';
  const duplicateCamera = (cameraId: string): void => {
    if (!staging) throw new Error('Model Preview staging is unavailable.');
    const sourceCamera = staging.cameraPresets.find((camera) => camera.id === cameraId);
    if (!sourceCamera) throw new Error(`Unknown Model Preview camera: ${cameraId}`);
    const next = duplicateModelCamera(
      staging,
      cameraId,
      `${sourceCamera.label} ${t('preview.model.copySuffix')}`,
    );
    const previousIds = new Set(staging.cameraPresets.map((camera) => camera.id));
    const duplicate = next.cameraPresets.find((camera) => !previousIds.has(camera.id));
    if (!duplicate) throw new Error('Model Preview camera duplication produced no camera.');
    updateStaging(next);
    setSceneSelection({ kind: 'camera', cameraId: duplicate.id });
    setViewportMode('navigate');
  };
  const removeCamera = (cameraId: string): void => {
    if (!staging) throw new Error('Model Preview staging is unavailable.');
    const next = removeModelCamera(staging, cameraId);
    updateStaging(next);
    setSceneSelection({ kind: 'camera', cameraId: next.activeCameraId });
    setViewportMode('navigate');
  };
  const viewCamera = (cameraId: string): void => {
    if (!staging) throw new Error('Model Preview staging is unavailable.');
    const camera = staging.cameraPresets.find((preset) => preset.id === cameraId);
    if (!camera) throw new Error(`Unknown Model Preview camera: ${cameraId}`);
    runtimeRef.current?.frameCamera(camera);
    if (staging.activeCameraId !== cameraId) {
      updateStaging(selectModelCamera(staging, cameraId));
    }
    setSceneSelection({ kind: 'camera', cameraId });
    setViewportMode('navigate');
  };

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
      data-view-distance={viewState.distance}
      data-view-target={`${viewState.target.x},${viewState.target.y},${viewState.target.z}`}
      data-selection-kind={sceneSelection.kind}
    >
      <ModelScenePanel
        disabled={controlsDisabled}
        nodes={nodes}
        selection={sceneSelection}
        staging={staging}
        onCameraAction={(cameraId, action) => {
          switch (action) {
            case 'edit':
              setSceneSelection({ kind: 'camera', cameraId });
              setViewportMode('navigate');
              break;
            case 'duplicate': {
              duplicateCamera(cameraId);
              break;
            }
            case 'view': {
              viewCamera(cameraId);
              break;
            }
            case 'remove': {
              removeCamera(cameraId);
              break;
            }
          }
        }}
        onSelectionChange={(selection) => {
          setSceneSelection(selection);
          if (selection.kind === 'node') {
            if (!staging) throw new Error('Model Preview staging is unavailable.');
            updateStaging(selectModelNode(staging, selection.nodePath));
            setViewportMode('inspect');
          } else {
            setViewportMode('navigate');
          }
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
          hasSelection={sceneSelection.kind === 'node' && staging?.selectedNodePath !== undefined}
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
        diagnostic={status === 'ready' ? diagnostic : undefined}
        disabled={controlsDisabled}
        facts={facts}
        nodes={nodes}
        selection={sceneSelection}
        staging={staging}
        onDuplicateCamera={duplicateCamera}
        onRemoveCamera={removeCamera}
        onUpdateStaging={updateStaging}
        onViewCamera={viewCamera}
      />
    </main>
  );
}

async function handleExtensionMessage(input: {
  readonly message: ThreeReferenceExtensionMessage;
  readonly runtime: ThreeModelRuntimePort;
  readonly sessionId: string;
  readonly vscode: ReturnType<typeof getVscodeApi>;
  readonly setStatus: (status: ViewerStatus) => void;
  readonly setStaging: (state: ModelPreviewStagingState) => void;
  readonly setFacts: (facts: NormalizedModelFacts | undefined) => void;
  readonly setNodes: (nodes: readonly ModelPreviewNode[]) => void;
  readonly setSceneSelection: (selection: ModelSceneSelection) => void;
  readonly setDiagnostic: (diagnostic: ModelPreviewDiagnostic | undefined) => void;
  readonly stagingRef: React.MutableRefObject<ModelPreviewStagingState | undefined>;
  readonly referenceStagingRef: React.MutableRefObject<ThreeReferenceStagingSnapshot | undefined>;
}): Promise<void> {
  const { message } = input;
  try {
    switch (message.type) {
      case '3d-reference/session-init': {
        if (message.staging.sessionId !== input.sessionId) {
          throw new Error('3D Reference session identity does not match this Webview.');
        }
        input.setStatus('loading');
        input.setDiagnostic(undefined);
        input.setSceneSelection({ kind: 'scene' });
        input.referenceStagingRef.current = message.staging;
        const viewportStaging = toViewportStaging(message.staging);
        input.stagingRef.current = viewportStaging;
        input.setStaging(viewportStaging);
        let facts: NormalizedModelFacts | undefined;
        if (message.panelSubject.kind === 'source-model') {
          facts = await input.runtime.load(toModelSourceDescriptor(message.panelSubject));
          input.runtime.applyStaging(viewportStaging);
          input.setFacts(facts);
          input.setNodes(input.runtime.getNodes());
        } else if (message.panelSubject.kind === 'builtin-preset') {
          facts = await input.runtime.loadPreset(message.panelSubject);
          if (message.staging.pose) input.runtime.applyReferencePose(message.staging.pose);
          input.runtime.applyStaging(viewportStaging);
          input.setFacts(facts);
          input.setNodes(input.runtime.getNodes());
        } else {
          input.setFacts(undefined);
          input.setNodes([]);
        }
        input.setStatus('ready');
        input.vscode.postMessage({
          type: '3d-reference/load-completed',
          identity: referenceIdentityOf(message.staging),
          ...(facts ? { facts } : {}),
        });
        break;
      }
      case '3d-reference/diagnostic':
        input.setDiagnostic(toModelDiagnostic(message.diagnostic));
        if (message.diagnostic.severity === 'error') {
          if (isViewerFatalDiagnostic(message.diagnostic.code)) {
            input.setStatus('error');
          }
        }
        break;
      case '3d-reference/environment-runtime': {
        if (message.identity.sessionId !== input.sessionId) return;
        input.referenceStagingRef.current = message.staging;
        const viewportStaging = toViewportStaging(message.staging);
        input.stagingRef.current = viewportStaging;
        input.setStaging(viewportStaging);
        await input.runtime.setPanoramaEnvironment({
          runtime: message.runtime,
          orientation: message.staging.environment?.orientation ?? missingPanoramaOrientation(),
        });
        break;
      }
      case '3d-reference/cancel':
        if (message.identity.sessionId !== input.sessionId) return;
        input.setStatus('error');
        input.setDiagnostic({
          code: 'disposed',
          message: message.reason,
          severity: 'error',
        });
        break;
    }
  } catch (error) {
    const diagnostic: ModelPreviewDiagnostic = {
      code: 'load-failed',
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
      identity: input.stagingRef.current
        ? {
            sessionId: input.sessionId,
            revision: input.referenceStagingRef.current?.revision ?? 0,
          }
        : { sessionId: input.sessionId },
    };
    input.setDiagnostic(diagnostic);
    if (isViewerFatalDiagnostic(diagnostic.code)) {
      input.setStatus('error');
    }
    input.vscode.postMessage({
      type: '3d-reference/diagnostic',
      diagnostic: {
        code: 'source-load-failed',
        message: diagnostic.message,
        severity: 'error',
        ...(diagnostic.identity
          ? {
              identity: {
                ...(diagnostic.identity.sessionId
                  ? { sessionId: diagnostic.identity.sessionId }
                  : {}),
                ...(diagnostic.identity.revision === undefined
                  ? {}
                  : { revision: diagnostic.identity.revision }),
              },
            }
          : {}),
      },
    });
  }
}

function isViewerFatalDiagnostic(code: string): boolean {
  switch (code) {
    case 'stale-revision':
      return false;
    default:
      return true;
  }
}

function toModelDiagnostic(
  diagnostic: Extract<
    ThreeReferenceExtensionMessage,
    { type: '3d-reference/diagnostic' }
  >['diagnostic'],
): ModelPreviewDiagnostic {
  return {
    code:
      diagnostic.code === 'stale-revision'
        ? 'stale-revision'
        : diagnostic.code === 'renderer-lost'
          ? 'renderer-lost'
          : diagnostic.code === 'renderer-unavailable'
            ? 'renderer-unavailable'
            : 'load-failed',
    message: diagnostic.message,
    severity: diagnostic.severity,
    identity: diagnostic.identity,
  };
}

function postState(
  vscode: ReturnType<typeof getVscodeApi>,
  viewportStaging: ModelPreviewStagingState,
  staging: ThreeReferenceStagingSnapshot,
): ThreeReferenceStagingSnapshot {
  const activeCamera = viewportStaging.cameraPresets.find(
    (camera) => camera.id === viewportStaging.activeCameraId,
  );
  if (!activeCamera) throw new Error('3D Reference active camera is unavailable.');
  const next: ThreeReferenceStagingSnapshot = {
    ...staging,
    revision: staging.revision + 1,
    camera: {
      cameraId: activeCamera.id,
      position: activeCamera.position,
      target: activeCamera.target,
      fieldOfViewDeg: activeCamera.fieldOfViewDeg,
      aspectRatio: staging.camera.aspectRatio,
    },
  };
  vscode.setState({ threeReferenceStaging: next });
  vscode.postMessage({ type: '3d-reference/staging-changed', staging: next });
  return next;
}

function referenceIdentityOf(staging: ThreeReferenceStagingSnapshot) {
  return {
    sessionId: staging.sessionId,
    revision: staging.revision,
  };
}

function parseExtensionMessage(value: unknown): ThreeReferenceExtensionMessage | undefined {
  if (!isRecord(value) || typeof value['type'] !== 'string') return undefined;
  switch (value['type']) {
    case '3d-reference/session-init':
      return value['protocolVersion'] === THREE_REFERENCE_PROTOCOL_VERSION &&
        isThreeReferencePanelSubject(value['panelSubject']) &&
        Array.isArray(value['eligiblePurposes']) &&
        value['eligiblePurposes'].every(isThreeReferencePurpose) &&
        isThreeReferenceStagingSnapshot(value['staging'])
        ? {
            type: '3d-reference/session-init',
            protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
            panelSubject: value['panelSubject'],
            eligiblePurposes: value['eligiblePurposes'],
            staging: value['staging'],
          }
        : undefined;
    case '3d-reference/diagnostic':
      return isThreeReferenceDiagnostic(value['diagnostic'])
        ? { type: '3d-reference/diagnostic', diagnostic: value['diagnostic'] }
        : undefined;
    case '3d-reference/environment-runtime':
      return isThreeReferenceIdentity(value['identity']) &&
        isThreeReferenceStagingSnapshot(value['staging']) &&
        isThreeReferencePanoramaRuntimeDescriptor(value['runtime']) &&
        value['identity'].sessionId === value['staging'].sessionId &&
        value['identity'].revision === value['staging'].revision &&
        value['staging'].environment?.source.id === value['runtime'].source.id &&
        value['staging'].environment?.fingerprint === value['runtime'].fingerprint
        ? {
            type: '3d-reference/environment-runtime',
            identity: value['identity'],
            staging: value['staging'],
            runtime: value['runtime'],
          }
        : undefined;
    case '3d-reference/cancel': {
      const revision = isRecord(value['identity']) ? value['identity']['revision'] : undefined;
      return isRecord(value['identity']) &&
        typeof value['identity']['sessionId'] === 'string' &&
        typeof revision === 'number' &&
        Number.isInteger(revision) &&
        typeof value['reason'] === 'string'
        ? {
            type: '3d-reference/cancel',
            identity: {
              sessionId: value['identity']['sessionId'],
              revision,
            },
            reason: value['reason'],
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

function missingPanoramaOrientation(): never {
  throw new Error('3D Reference environment runtime is missing panorama orientation.');
}

function toModelSourceDescriptor(
  panelSubject: Extract<ThreeReferencePanelSubject, { kind: 'source-model' }>,
): ModelPreviewSourceDescriptor {
  return {
    source: panelSubject.runtime.source,
    sourceFingerprint: panelSubject.runtime.fingerprint,
    format: panelSubject.runtime.format,
    entryUri: panelSubject.runtime.entryUri,
    uriMap: panelSubject.runtime.uriMap,
    sizeBytes: panelSubject.runtime.sizeBytes,
  };
}

function toViewportStaging(staging: ThreeReferenceStagingSnapshot): ModelPreviewStagingState {
  return {
    schemaVersion: 3,
    sessionId: staging.sessionId,
    sourceFingerprint: subjectFingerprint(staging),
    revision: 0,
    transformPatches: [],
    cameraPresets: [
      {
        id: staging.camera.cameraId,
        label: staging.camera.cameraId === 'camera-front' ? 'Front' : staging.camera.cameraId,
        position: staging.camera.position,
        target: staging.camera.target,
        fieldOfViewDeg: staging.camera.fieldOfViewDeg,
      },
    ],
    activeCameraId: staging.camera.cameraId,
    lightRig: {
      environmentIntensity: 0.7,
      lights: [
        { id: 'key', color: '#ffffff', intensity: 3, position: { x: 3, y: 4, z: 4 } },
        { id: 'fill', color: '#b8d8ff', intensity: 1.2, position: { x: -3, y: 2, z: 2 } },
        { id: 'rim', color: '#ffd2a8', intensity: 1.8, position: { x: 0, y: 3, z: -4 } },
      ],
    },
    background: '#f5f6f8',
    capture: { width: 1024, height: 1024 },
  };
}

function subjectFingerprint(staging: ThreeReferenceStagingSnapshot): string {
  switch (staging.subject.kind) {
    case 'source-model':
      return staging.subject.fingerprint;
    case 'builtin-preset':
      return staging.subject.fingerprint;
    case 'environment-only':
      return 'environment-only';
  }
  throw new Error('Unknown 3D Reference subject kind.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
