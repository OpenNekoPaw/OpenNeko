import {
  AxisGroup,
  Button,
  ColorPropertyRow,
  NumberPropertyRow,
  PanelSection,
  SelectPropertyRow,
  SliderPropertyRow,
  toCodiconClassName,
} from '@neko/ui';
import type {
  ModelPreviewDiagnostic,
  ModelPreviewStagingState,
  ModelPreviewTransform,
  ModelPreviewVector3,
  NormalizedModelFacts,
} from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';
import {
  patchModelTransform,
  selectModelCamera,
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
  readonly diagnostic?: ModelPreviewDiagnostic;
  readonly disabled: boolean;
  readonly deliveryStatus: 'idle' | 'sending' | 'succeeded' | 'error';
  readonly onUpdateStaging: (staging: ModelPreviewStagingState) => void;
  readonly onSendToAgent: () => void;
}

export function ModelInspectorPanel({
  deliveryStatus,
  diagnostic,
  disabled,
  facts,
  nodes,
  onSendToAgent,
  onUpdateStaging,
  staging,
}: ModelInspectorPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const activeCamera = staging?.cameraPresets.find(
    (camera) => camera.id === staging.activeCameraId,
  );
  const selectedNode = nodes.find((node) => node.path === staging?.selectedNodePath);
  const selectedPatch = staging?.transformPatches.find(
    (patch) => patch.nodePath === staging.selectedNodePath,
  );
  const selectedTransform = selectedPatch?.transform ?? selectedNode?.transform;
  const deliveryPresentation = getDeliveryPresentation(deliveryStatus, t);
  const updateSelectedTransform = (transform: ModelPreviewTransform): void => {
    if (!staging?.selectedNodePath) return;
    onUpdateStaging(patchModelTransform(staging, staging.selectedNodePath, transform));
  };

  return (
    <aside
      className="model-preview__inspector"
      data-testid="model-preview-inspector"
      aria-label={t('preview.model.staging')}
    >
      <header className="model-preview__inspector-header">
        <div className="model-preview__inspector-title-row">
          <div>
            <span className="model-preview__eyebrow">{t('preview.model.title')}</span>
            <h1>{t('preview.model.staging')}</h1>
          </div>
          <span className="model-preview__readonly-badge">
            <span className={toCodiconClassName('lock')} aria-hidden="true" />
            {t('preview.model.readOnlyBadge')}
          </span>
        </div>
        <p>{t('preview.model.readOnly')}</p>
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
        {facts ? <ModelFacts facts={facts} /> : null}
        <PanelSection
          className="model-preview__inspector-section"
          density="compact"
          disabled={disabled || !selectedTransform}
          title={t('preview.model.transform')}
          description={selectedNode?.label ?? t('preview.model.noSelection')}
        >
          {selectedTransform ? (
            <>
              <TransformAxisGroup
                label={t('preview.model.position')}
                value={selectedTransform.position}
                onCommit={(value) =>
                  updateSelectedTransform({ ...selectedTransform, position: value })
                }
              />
              <TransformAxisGroup
                label={t('preview.model.rotation')}
                value={selectedTransform.rotation}
                step={0.05}
                onCommit={(value) =>
                  updateSelectedTransform({
                    ...selectedTransform,
                    rotation: { ...value, order: 'XYZ' },
                  })
                }
              />
              <TransformAxisGroup
                label={t('preview.model.scale')}
                value={selectedTransform.scale}
                min={0.001}
                step={0.05}
                onCommit={(value) =>
                  updateSelectedTransform({ ...selectedTransform, scale: value })
                }
              />
            </>
          ) : (
            <p className="model-preview__selection-empty">
              <span className={toCodiconClassName('symbol-misc')} aria-hidden="true" />
              {t('preview.model.noSelection')}
            </p>
          )}
        </PanelSection>
        <PanelSection
          className="model-preview__inspector-section"
          density="compact"
          disabled={disabled}
          title={t('preview.model.camera')}
        >
          <div data-testid="model-preview-camera-controls">
            <SelectPropertyRow
              density="compact"
              disabled={disabled}
              id="model-camera"
              label={t('preview.model.cameraPreset')}
              value={staging?.activeCameraId ?? ''}
              options={(staging?.cameraPresets ?? []).map((camera) => ({
                value: camera.id,
                label: camera.label,
              }))}
              onCommit={(_, cameraId) => {
                if (staging) onUpdateStaging(selectModelCamera(staging, cameraId));
              }}
            />
            {activeCamera ? (
              <SliderPropertyRow
                density="compact"
                disabled={disabled}
                id="model-camera-fov"
                label={t('preview.model.fieldOfView')}
                min={10}
                max={120}
                step={1}
                unit="°"
                value={activeCamera.fieldOfViewDeg}
                onCommit={(_, value) => {
                  if (staging) {
                    onUpdateStaging(
                      updateModelCamera(staging, { ...activeCamera, fieldOfViewDeg: value }),
                    );
                  }
                }}
              />
            ) : null}
          </div>
        </PanelSection>
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
          title={t('preview.model.output')}
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
