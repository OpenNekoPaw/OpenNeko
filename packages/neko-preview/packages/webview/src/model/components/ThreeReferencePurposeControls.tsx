import { useMemo, useState } from 'react';
import {
  Button,
  PanelSection,
  SelectPropertyRow,
  SliderPropertyRow,
  toCodiconClassName,
} from '@neko/ui';
import type {
  ThreeReferencePanelSubject,
  ThreeReferencePoseControlMode,
  ThreeReferencePoseState,
  ThreeReferencePurpose,
  ThreeReferenceRuntimeJointConstraint,
  ThreeReferenceStagingSnapshot,
} from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';

export interface ThreeReferencePurposeControlsProps {
  readonly disabled: boolean;
  readonly eligiblePurposes: readonly ThreeReferencePurpose[];
  readonly panelSubject?: ThreeReferencePanelSubject;
  readonly staging?: ThreeReferenceStagingSnapshot;
  readonly onPurposeChange: (purposes: readonly ThreeReferencePurpose[]) => void;
  readonly onPoseChange: (pose: ThreeReferencePoseState) => void;
  readonly onCapture: (
    purpose: ThreeReferencePurpose,
    poseControlMode?: ThreeReferencePoseControlMode,
  ) => void;
}

const PURPOSES: readonly ThreeReferencePurpose[] = [
  'appearance',
  'pose',
  'camera',
  'panorama-scene',
];

export function ThreeReferencePurposeControls({
  disabled,
  eligiblePurposes,
  onCapture,
  onPoseChange,
  onPurposeChange,
  panelSubject,
  staging,
}: ThreeReferencePurposeControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const capabilities =
    panelSubject?.kind === 'builtin-preset' && panelSubject.runtime.kind === 'procedural'
      ? panelSubject.runtime.poseCapabilities
      : undefined;
  const [selectedJointId, setSelectedJointId] = useState<string>('');
  const [poseControlMode, setPoseControlMode] = useState<ThreeReferencePoseControlMode>('pose');
  const selectedJoint = capabilities?.joints.find((joint) => joint.jointId === selectedJointId);
  const jointRotation = useMemo(
    () =>
      staging?.pose?.joints.find((joint) => joint.jointId === selectedJoint?.jointId)?.rotation ?? {
        x: 0,
        y: 0,
        z: 0,
        order: 'XYZ' as const,
      },
    [selectedJoint?.jointId, staging?.pose?.joints],
  );

  return (
    <div className="model-preview__reference-controls" data-testid="3d-reference-controls">
      {panelSubject?.kind === 'builtin-preset' &&
      panelSubject.subject.appearancePolicy === 'guide-only' ? (
        <p className="model-preview__guide-only" role="note">
          <span className={toCodiconClassName('shield')} aria-hidden="true" />
          {t('preview.model.guideOnly')}
        </p>
      ) : null}
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled={disabled}
        title={t('preview.model.referencePurposes')}
        description={t('preview.model.referencePurposesDescription')}
      >
        <div
          className="model-preview__purpose-grid"
          role="group"
          aria-label={t('preview.model.referencePurposes')}
        >
          {PURPOSES.map((purpose) => {
            const eligible = eligiblePurposes.includes(purpose);
            const selected = staging?.selectedPurposes.includes(purpose) ?? false;
            return (
              <Button
                key={purpose}
                aria-pressed={selected}
                disabled={
                  disabled || !eligible || (selected && staging?.selectedPurposes.length === 1)
                }
                size="xs"
                variant={selected ? 'default' : 'secondary'}
                onClick={() => {
                  if (!staging || !eligible) return;
                  onPurposeChange(
                    selected
                      ? staging.selectedPurposes.filter((entry) => entry !== purpose)
                      : [...staging.selectedPurposes, purpose],
                  );
                }}
              >
                {t(`preview.model.purpose.${purpose}`)}
              </Button>
            );
          })}
        </div>
      </PanelSection>
      <PoseControls
        capabilities={capabilities}
        disabled={disabled}
        jointRotation={jointRotation}
        pose={staging?.pose}
        poseControlMode={poseControlMode}
        selectedJoint={selectedJoint}
        selectedJointId={selectedJointId}
        onCapture={() => onCapture('pose', poseControlMode)}
        onJointChange={(axis, value) => {
          if (!staging?.pose || !selectedJoint) return;
          onPoseChange(updateJointRotation(staging.pose, selectedJoint.jointId, axis, value));
        }}
        onPoseChange={onPoseChange}
        onPoseControlModeChange={setPoseControlMode}
        onSelectedJointChange={setSelectedJointId}
      />
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled={disabled}
        title={t('preview.model.captureReference')}
      >
        <div className="model-preview__capture-actions">
          {(staging?.selectedPurposes ?? []).map((purpose) => (
            <Button
              key={purpose}
              disabled={disabled}
              size="xs"
              variant="secondary"
              onClick={() => onCapture(purpose, purpose === 'pose' ? poseControlMode : undefined)}
            >
              {t('preview.model.capturePurpose', {
                purpose: t(`preview.model.purpose.${purpose}`),
              })}
            </Button>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

function PoseControls({
  capabilities,
  disabled,
  jointRotation,
  onCapture,
  onJointChange,
  onPoseChange,
  onPoseControlModeChange,
  onSelectedJointChange,
  pose,
  poseControlMode,
  selectedJoint,
  selectedJointId,
}: {
  readonly capabilities?: {
    readonly posePresetIds: readonly string[];
    readonly joints: readonly ThreeReferenceRuntimeJointConstraint[];
  };
  readonly disabled: boolean;
  readonly jointRotation: { readonly x: number; readonly y: number; readonly z: number };
  readonly pose?: ThreeReferencePoseState;
  readonly poseControlMode: ThreeReferencePoseControlMode;
  readonly selectedJoint?: ThreeReferenceRuntimeJointConstraint;
  readonly selectedJointId: string;
  readonly onCapture: () => void;
  readonly onJointChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  readonly onPoseChange: (pose: ThreeReferencePoseState) => void;
  readonly onPoseControlModeChange: (mode: ThreeReferencePoseControlMode) => void;
  readonly onSelectedJointChange: (jointId: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (!capabilities || !pose) {
    return (
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled
        title={t('preview.model.pose')}
        description={t('preview.model.poseUnsupported')}
      />
    );
  }
  return (
    <PanelSection
      className="model-preview__inspector-section"
      density="compact"
      disabled={disabled}
      title={t('preview.model.pose')}
    >
      <SelectPropertyRow
        density="compact"
        disabled={disabled}
        id="reference-pose-preset"
        label={t('preview.model.posePreset')}
        options={capabilities.posePresetIds.map((poseId) => ({ value: poseId, label: poseId }))}
        value={pose.poseId}
        onCommit={(_, poseId) => onPoseChange({ poseId, joints: [] })}
      />
      <SelectPropertyRow
        density="compact"
        disabled={disabled}
        id="reference-pose-joint"
        label={t('preview.model.poseJoint')}
        options={capabilities.joints.map((joint) => ({
          value: joint.jointId,
          label: joint.jointId,
        }))}
        value={selectedJointId}
        onCommit={(_, jointId) => onSelectedJointChange(jointId)}
      />
      {selectedJoint
        ? (['x', 'y', 'z'] as const).map((axis) => (
            <SliderPropertyRow
              key={axis}
              density="compact"
              disabled={disabled}
              id={`reference-joint-${selectedJoint.jointId}-${axis}`}
              label={t('preview.model.rotationAxis', { axis: axis.toUpperCase() })}
              min={selectedJoint.rotationConstraint.min[axis]}
              max={selectedJoint.rotationConstraint.max[axis]}
              step={0.01}
              value={jointRotation[axis]}
              onCommit={(_, value) => onJointChange(axis, value)}
            />
          ))
        : null}
      <SelectPropertyRow
        density="compact"
        disabled={disabled}
        id="reference-pose-control-mode"
        label={t('preview.model.controlMode')}
        options={[
          { value: 'pose', label: t('preview.model.controlMode.pose') },
          { value: 'depth', label: t('preview.model.controlMode.depth') },
        ]}
        value={poseControlMode}
        onCommit={(_, mode) => onPoseControlModeChange(requirePoseControlMode(mode))}
      />
      <Button disabled={disabled} size="xs" variant="secondary" onClick={onCapture}>
        {t('preview.model.previewControlOutput')}
      </Button>
    </PanelSection>
  );
}

function updateJointRotation(
  pose: ThreeReferencePoseState,
  jointId: string,
  axis: 'x' | 'y' | 'z',
  value: number,
): ThreeReferencePoseState {
  const current = pose.joints.find((joint) => joint.jointId === jointId);
  const rotation = current?.rotation ?? { x: 0, y: 0, z: 0, order: 'XYZ' as const };
  const nextJoint = { jointId, rotation: { ...rotation, [axis]: value } };
  return {
    ...pose,
    joints: current
      ? pose.joints.map((joint) => (joint.jointId === jointId ? nextJoint : joint))
      : [...pose.joints, nextJoint],
  };
}

function requirePoseControlMode(value: string): ThreeReferencePoseControlMode {
  if (value === 'pose' || value === 'depth') return value;
  throw new Error(`Unknown 3D Reference pose control mode: ${value}`);
}
