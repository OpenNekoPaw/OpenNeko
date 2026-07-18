import {
  AxisGroup,
  Button,
  ColorPropertyRow,
  NumberPropertyRow,
  PanelSection,
  PropertyRow,
  SegmentedControl,
  SliderPropertyRow,
  toCodiconClassName,
} from '@neko/ui';
import type {
  ModelPreviewCameraPreset,
  ModelPreviewDiagnostic,
  ModelPreviewStagingState,
  ModelPreviewTransform,
  ModelPreviewVector3,
  NormalizedModelFacts,
} from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';
import type { ModelSceneSelection } from '../modelSceneSelection';
import {
  patchModelTransform,
  updateModelBackground,
  updateModelCamera,
  updateModelCapture,
  updateModelEnvironmentIntensity,
  updateModelLight,
} from '../modelStagingStore';
import type { ModelPreviewNode } from '../threeRuntime';

export interface ModelInspectorPanelProps {
  readonly staging?: ModelPreviewStagingState;
  readonly facts?: NormalizedModelFacts;
  readonly nodes: readonly ModelPreviewNode[];
  readonly selection: ModelSceneSelection;
  readonly diagnostic?: ModelPreviewDiagnostic;
  readonly disabled: boolean;
  readonly deliveryStatus: 'idle' | 'sending' | 'succeeded' | 'error';
  readonly onUpdateStaging: (staging: ModelPreviewStagingState) => void;
  readonly onDuplicateCamera: (cameraId: string) => void;
  readonly onRemoveCamera: (cameraId: string) => void;
  readonly onViewCamera: (cameraId: string) => void;
  readonly onSendToAgent: () => void;
}

export function ModelInspectorPanel({
  deliveryStatus,
  diagnostic,
  disabled,
  facts,
  nodes,
  onDuplicateCamera,
  onRemoveCamera,
  onSendToAgent,
  onUpdateStaging,
  onViewCamera,
  selection,
  staging,
}: ModelInspectorPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const selectedCamera =
    selection.kind === 'camera'
      ? staging?.cameraPresets.find((camera) => camera.id === selection.cameraId)
      : undefined;
  const selectedNode =
    selection.kind === 'node' ? nodes.find((node) => node.path === selection.nodePath) : undefined;
  const presentation = inspectorPresentation(selection, selectedCamera, selectedNode, t);
  const deliveryPresentation = getDeliveryPresentation(deliveryStatus, t);

  return (
    <aside
      className="model-preview__inspector"
      data-testid="model-preview-inspector"
      data-inspector-kind={selection.kind}
      aria-label={presentation.title}
    >
      <header className="model-preview__inspector-header">
        <div className="model-preview__inspector-title-row">
          <div className="model-preview__inspector-heading">
            <span className={toCodiconClassName(presentation.icon)} aria-hidden="true" />
            <div>
              <span className="model-preview__eyebrow">{presentation.eyebrow}</span>
              <h1>{presentation.title}</h1>
            </div>
          </div>
          <span className="model-preview__readonly-badge">
            <span className={toCodiconClassName(presentation.badgeIcon)} aria-hidden="true" />
            {presentation.badge}
          </span>
        </div>
        <p>{presentation.description}</p>
      </header>
      {diagnostic ? (
        <p
          className={`model-preview__diagnostic model-preview__diagnostic--${diagnostic.severity}`}
          role={diagnostic.severity === 'error' ? 'alert' : 'status'}
        >
          {diagnostic.message}
        </p>
      ) : null}
      <div className="model-preview__inspector-content">
        {selection.kind === 'scene' ? (
          <SceneInspector
            disabled={disabled}
            facts={facts}
            staging={staging}
            onUpdateStaging={onUpdateStaging}
          />
        ) : null}
        {selection.kind === 'camera' ? (
          <CameraInspector
            camera={selectedCamera}
            disabled={disabled}
            onlyCamera={(staging?.cameraPresets.length ?? 0) <= 1}
            staging={staging}
            onDuplicateCamera={onDuplicateCamera}
            onRemoveCamera={onRemoveCamera}
            onUpdateStaging={onUpdateStaging}
            onViewCamera={onViewCamera}
          />
        ) : null}
        {selection.kind === 'node' ? (
          <NodeInspector
            disabled={disabled}
            node={selectedNode}
            nodePath={selection.nodePath}
            staging={staging}
            onUpdateStaging={onUpdateStaging}
          />
        ) : null}
      </div>
      <footer className="model-preview__inspector-footer">
        <Button
          className="model-preview__send"
          data-testid="model-preview-send-to-agent"
          aria-busy={deliveryStatus === 'sending'}
          disabled={disabled || deliveryStatus === 'sending'}
          data-delivery-status={deliveryStatus}
          leadingIcon={
            <span className={toCodiconClassName(deliveryPresentation.icon)} aria-hidden="true" />
          }
          onClick={onSendToAgent}
        >
          <span aria-live="polite">{deliveryPresentation.label}</span>
        </Button>
      </footer>
    </aside>
  );
}

function SceneInspector({
  disabled,
  facts,
  onUpdateStaging,
  staging,
}: Pick<
  ModelInspectorPanelProps,
  'disabled' | 'facts' | 'onUpdateStaging' | 'staging'
>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div data-testid="model-preview-scene-inspector">
      {facts ? <ModelFacts facts={facts} /> : null}
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled={disabled}
        title={t('preview.model.lighting')}
      >
        <div data-testid="model-preview-light-controls">
          <SliderPropertyRow
            density="compact"
            disabled={disabled}
            id="model-environment"
            label={t('preview.model.environment')}
            min={0}
            max={3}
            step={0.1}
            value={staging?.lightRig.environmentIntensity ?? 0}
            onCommit={(_, value) => {
              if (staging) onUpdateStaging(updateModelEnvironmentIntensity(staging, value));
            }}
          />
          {(staging?.lightRig.lights ?? []).map((light) => (
            <div
              className="model-preview__light-group"
              key={light.id}
              data-testid={`model-preview-light-${light.id}`}
            >
              <SliderPropertyRow
                density="compact"
                disabled={disabled}
                id={`model-light-${light.id}`}
                label={t(`preview.model.light.${light.id}`)}
                min={0}
                max={10}
                step={0.1}
                value={light.intensity}
                onCommit={(_, value) => {
                  if (staging) {
                    onUpdateStaging(updateModelLight(staging, { ...light, intensity: value }));
                  }
                }}
              />
              <ColorPropertyRow
                density="compact"
                disabled={disabled}
                id={`model-light-${light.id}-color`}
                label={t('preview.model.color')}
                value={normalizeColor(light.color)}
                onCommit={(_, value) => {
                  if (staging) {
                    onUpdateStaging(updateModelLight(staging, { ...light, color: value }));
                  }
                }}
              />
            </div>
          ))}
        </div>
      </PanelSection>
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled={disabled}
        title={t('preview.model.backgroundOutput')}
      >
        <ColorPropertyRow
          density="compact"
          disabled={disabled}
          id="model-background"
          label={t('preview.model.background')}
          value={staging?.background ?? '#f5f6f8'}
          onCommit={(_, value) => {
            if (staging) onUpdateStaging(updateModelBackground(staging, value));
          }}
        />
        <NumberPropertyRow
          density="compact"
          disabled={disabled}
          id="model-capture-width"
          label={t('preview.model.captureWidth')}
          min={64}
          max={2048}
          step={1}
          unit="px"
          value={staging?.capture.width ?? 1024}
          onCommit={(_, width) => {
            if (staging)
              onUpdateStaging(updateModelCapture(staging, { ...staging.capture, width }));
          }}
        />
        <NumberPropertyRow
          density="compact"
          disabled={disabled}
          id="model-capture-height"
          label={t('preview.model.captureHeight')}
          min={64}
          max={2048}
          step={1}
          unit="px"
          value={staging?.capture.height ?? 1024}
          onCommit={(_, height) => {
            if (staging)
              onUpdateStaging(updateModelCapture(staging, { ...staging.capture, height }));
          }}
        />
      </PanelSection>
    </div>
  );
}

function CameraInspector({
  camera,
  disabled,
  onDuplicateCamera,
  onRemoveCamera,
  onUpdateStaging,
  onViewCamera,
  onlyCamera,
  staging,
}: {
  readonly camera?: ModelPreviewCameraPreset;
  readonly disabled: boolean;
  readonly onlyCamera: boolean;
  readonly staging?: ModelPreviewStagingState;
  readonly onDuplicateCamera: (cameraId: string) => void;
  readonly onRemoveCamera: (cameraId: string) => void;
  readonly onUpdateStaging: (staging: ModelPreviewStagingState) => void;
  readonly onViewCamera: (cameraId: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (!camera || !staging) {
    return <p className="model-preview__selection-empty">{t('preview.model.cameraMissing')}</p>;
  }
  const updateCamera = (next: ModelPreviewCameraPreset): void =>
    onUpdateStaging(updateModelCamera(staging, next));
  return (
    <div data-testid="model-preview-camera-inspector">
      <div className="model-preview__context-actions">
        <Button
          disabled={disabled}
          leadingIcon={<span className={toCodiconClassName('eye')} aria-hidden="true" />}
          size="xs"
          variant="secondary"
          onClick={() => onViewCamera(camera.id)}
        >
          {t('preview.model.cameraViewThrough')}
        </Button>
        <Button
          disabled={disabled}
          leadingIcon={<span className={toCodiconClassName('copy')} aria-hidden="true" />}
          size="xs"
          variant="ghost"
          onClick={() => onDuplicateCamera(camera.id)}
        >
          {t('preview.model.duplicate')}
        </Button>
        <Button
          disabled={disabled || onlyCamera}
          leadingIcon={<span className={toCodiconClassName('trash')} aria-hidden="true" />}
          size="xs"
          variant="ghost"
          onClick={() => onRemoveCamera(camera.id)}
        >
          {t('preview.model.remove')}
        </Button>
      </div>
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled={disabled}
        title={t('preview.model.cameraProperties')}
        description={
          camera.id === staging.activeCameraId
            ? t('preview.model.cameraActiveDescription')
            : undefined
        }
      >
        <PropertyRow
          density="compact"
          disabled={disabled}
          label={t('preview.model.name')}
          propertyId="model-camera-name"
        >
          <input
            key={`${camera.id}:${camera.label}`}
            className="model-preview__text-input"
            aria-label={t('preview.model.cameraName')}
            defaultValue={camera.label}
            disabled={disabled}
            onBlur={(event) => updateCamera({ ...camera, label: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </PropertyRow>
        <TransformAxisGroup
          label={t('preview.model.position')}
          value={camera.position}
          onCommit={(position) => updateCamera({ ...camera, position })}
        />
        <TransformAxisGroup
          label={t('preview.model.cameraTarget')}
          value={camera.target}
          onCommit={(target) => updateCamera({ ...camera, target })}
        />
        <SliderPropertyRow
          density="compact"
          disabled={disabled}
          id="model-camera-fov"
          label={t('preview.model.fieldOfView')}
          min={10}
          max={120}
          step={1}
          unit="°"
          value={camera.fieldOfViewDeg}
          onCommit={(_, fieldOfViewDeg) => updateCamera({ ...camera, fieldOfViewDeg })}
        />
      </PanelSection>
    </div>
  );
}

function NodeInspector({
  disabled,
  node,
  nodePath,
  onUpdateStaging,
  staging,
}: {
  readonly disabled: boolean;
  readonly node?: ModelPreviewNode;
  readonly nodePath: string;
  readonly staging?: ModelPreviewStagingState;
  readonly onUpdateStaging: (staging: ModelPreviewStagingState) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const selectedPatch = staging?.transformPatches.find((patch) => patch.nodePath === nodePath);
  const transform = selectedPatch?.transform ?? node?.transform;
  const updateTransform = (next: ModelPreviewTransform): void => {
    if (staging) onUpdateStaging(patchModelTransform(staging, nodePath, next));
  };
  return (
    <div data-testid="model-preview-node-inspector">
      <div className="model-preview__inspector-tabs">
        <SegmentedControl
          label={t('preview.model.characterInspectorMode')}
          options={[
            { value: 'properties', label: t('preview.model.properties') },
            { value: 'pose', label: t('preview.model.pose'), disabled: true },
          ]}
          value="properties"
          onValueChange={(value) => {
            if (value !== 'properties') {
              throw new Error(`Unsupported Model Preview inspector mode: ${value}`);
            }
          }}
        />
      </div>
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled={disabled || !transform}
        title={t('preview.model.transform')}
        description={node?.label ?? t('preview.model.noSelection')}
      >
        {transform ? (
          <>
            <TransformAxisGroup
              label={t('preview.model.position')}
              value={transform.position}
              onCommit={(position) => updateTransform({ ...transform, position })}
            />
            <TransformAxisGroup
              label={t('preview.model.rotation')}
              value={transform.rotation}
              step={0.05}
              onCommit={(rotation) =>
                updateTransform({ ...transform, rotation: { ...rotation, order: 'XYZ' } })
              }
            />
            <TransformAxisGroup
              label={t('preview.model.scale')}
              value={transform.scale}
              min={0.001}
              step={0.05}
              onCommit={(scale) => updateTransform({ ...transform, scale })}
            />
          </>
        ) : (
          <p className="model-preview__selection-empty">{t('preview.model.noSelection')}</p>
        )}
      </PanelSection>
      <p className="model-preview__pose-note">{t('preview.model.poseUnavailable')}</p>
    </div>
  );
}

function inspectorPresentation(
  selection: ModelSceneSelection,
  camera: ModelPreviewCameraPreset | undefined,
  node: ModelPreviewNode | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): {
  readonly badge: string;
  readonly badgeIcon: 'lock' | 'edit';
  readonly description: string;
  readonly eyebrow: string;
  readonly icon: 'device-camera' | 'person' | 'symbol-namespace';
  readonly title: string;
} {
  switch (selection.kind) {
    case 'scene':
      return {
        badge: t('preview.model.readOnlyBadge'),
        badgeIcon: 'lock',
        description: t('preview.model.sceneInspectorDescription'),
        eyebrow: t('preview.model.title'),
        icon: 'symbol-namespace',
        title: t('preview.model.sceneSettings'),
      };
    case 'camera':
      return {
        badge: t('preview.model.temporaryCamera'),
        badgeIcon: 'edit',
        description: t('preview.model.cameraInspectorDescription'),
        eyebrow: t('preview.model.camera'),
        icon: 'device-camera',
        title: camera?.label ?? t('preview.model.cameraMissing'),
      };
    case 'node':
      return {
        badge: t('preview.model.temporaryStaging'),
        badgeIcon: 'edit',
        description: t('preview.model.nodeInspectorDescription'),
        eyebrow: t('preview.model.character'),
        icon: 'person',
        title: node?.label ?? t('preview.model.noSelection'),
      };
  }
}

function getDeliveryPresentation(
  status: ModelInspectorPanelProps['deliveryStatus'],
  t: ReturnType<typeof useTranslation>['t'],
): { readonly icon: 'account' | 'check' | 'loading' | 'refresh'; readonly label: string } {
  switch (status) {
    case 'idle':
      return { icon: 'account', label: t('preview.model.sendToAgent') };
    case 'sending':
      return { icon: 'loading', label: t('preview.model.sendingToAgent') };
    case 'succeeded':
      return { icon: 'check', label: t('preview.model.sentToAgent') };
    case 'error':
      return { icon: 'refresh', label: t('preview.model.retrySendToAgent') };
  }
}

function TransformAxisGroup({
  label,
  min,
  onCommit,
  step = 0.01,
  value,
}: {
  readonly label: string;
  readonly value: ModelPreviewVector3;
  readonly min?: number;
  readonly step?: number;
  readonly onCommit: (value: ModelPreviewVector3) => void;
}): React.JSX.Element {
  return (
    <AxisGroup density="compact" label={label}>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <AxisGroup.Axis
          key={axis}
          axis={axis.toUpperCase()}
          id={`${label}-${axis}`}
          min={min}
          step={step}
          value={value[axis]}
          onCommit={(_, nextValue) => onCommit({ ...value, [axis]: nextValue })}
        />
      ))}
    </AxisGroup>
  );
}

function ModelFacts({ facts }: { readonly facts: NormalizedModelFacts }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <dl className="model-preview__facts">
      <div>
        <dt>{t('preview.model.nodes')}</dt>
        <dd>{facts.nodeCount}</dd>
      </div>
      <div>
        <dt>{t('preview.model.meshes')}</dt>
        <dd>{facts.meshCount}</dd>
      </div>
      <div>
        <dt>{t('preview.model.materials')}</dt>
        <dd>{facts.materialCount}</dd>
      </div>
      <div>
        <dt>{t('preview.model.animations')}</dt>
        <dd>{facts.animationCount}</dd>
      </div>
    </dl>
  );
}

function normalizeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
}
