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
  ThreeReferencePanoramaOrientation,
  ThreeReferencePoseControlMode,
  ThreeReferencePoseState,
  ThreeReferencePurpose,
  ThreeReferenceRuntimeJointConstraint,
  ThreeReferenceRuntimePosePreset,
  ThreeReferenceStagingSnapshot,
} from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';

export interface ThreeReferencePurposeControlsProps {
  readonly disabled: boolean;
  readonly eligiblePurposes: readonly ThreeReferencePurpose[];
  readonly panelSubject?: ThreeReferencePanelSubject;
  readonly staging?: ThreeReferenceStagingSnapshot;
  readonly outputPreview?: string;
  readonly onPurposeChange: (purposes: readonly ThreeReferencePurpose[]) => void;
  readonly onPoseChange: (pose: ThreeReferencePoseState) => void;
  readonly onCapture: (
    purpose: ThreeReferencePurpose,
    poseControlMode?: ThreeReferencePoseControlMode,
  ) => void;
  readonly onCameraAspectRatioChange: (aspectRatio: number) => void;
  readonly onPanoramaOrientationChange: (orientation: ThreeReferencePanoramaOrientation) => void;
}

const PURPOSES: readonly ThreeReferencePurpose[] = [
  'appearance',
  'pose',
  'camera',
  'panorama-scene',
];

type PoseJointGroup = 'body' | 'torso' | 'head' | 'arms' | 'legs';

export function ThreeReferencePurposeControls({
  disabled,
  eligiblePurposes,
  onCapture,
  onCameraAspectRatioChange,
  onPanoramaOrientationChange,
  onPoseChange,
  onPurposeChange,
  panelSubject,
  outputPreview,
  staging,
}: ThreeReferencePurposeControlsProps): React.JSX.Element {
  const { t } = useTranslation();
  const capabilities =
    panelSubject?.kind === 'builtin-preset' && panelSubject.runtime.kind === 'procedural'
      ? panelSubject.runtime.poseCapabilities
      : undefined;
  const [selectedJointId, setSelectedJointId] = useState<string>('');
  const [selectedJointGroup, setSelectedJointGroup] = useState<PoseJointGroup>('body');
  const [poseControlMode, setPoseControlMode] = useState<ThreeReferencePoseControlMode>('pose');
  const groupedJoints = capabilities?.joints.filter(
    (joint) => poseJointGroupOf(joint.jointId) === selectedJointGroup,
  );
  const effectiveSelectedJointId = selectedJointId || groupedJoints?.[0]?.jointId || '';
  const selectedJoint = groupedJoints?.find((joint) => joint.jointId === effectiveSelectedJointId);
  const environment = staging?.environment;
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
          <span className={toCodiconClassName('lock')} aria-hidden="true" />
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
        selectedJointGroup={selectedJointGroup}
        selectedJointId={effectiveSelectedJointId}
        visibleJoints={groupedJoints ?? []}
        onCapture={() => onCapture('pose', poseControlMode)}
        onJointChange={(axis, value) => {
          if (!staging?.pose || !selectedJoint) return;
          onPoseChange(updateJointRotation(staging.pose, selectedJoint.jointId, axis, value));
        }}
        onPoseChange={onPoseChange}
        onPoseControlModeChange={setPoseControlMode}
        onSelectedJointChange={setSelectedJointId}
        onSelectedJointGroupChange={(group) => {
          setSelectedJointGroup(group);
          const firstJoint = capabilities?.joints.find(
            (joint) => poseJointGroupOf(joint.jointId) === group,
          );
          setSelectedJointId(firstJoint?.jointId ?? '');
        }}
      />
      <PanelSection
        className="model-preview__inspector-section"
        density="compact"
        disabled={disabled}
        title={t('preview.model.cameraComposition')}
      >
        <SelectPropertyRow
          density="compact"
          disabled={disabled}
          id="reference-camera-aspect"
          label={t('preview.model.aspectRatio')}
          options={[
            { value: '1', label: '1:1' },
            { value: String(16 / 9), label: '16:9' },
            { value: String(9 / 16), label: '9:16' },
            { value: String(4 / 3), label: '4:3' },
          ]}
          value={String(staging?.camera.aspectRatio ?? 1)}
          onCommit={(_, value) => onCameraAspectRatioChange(requirePositiveNumber(value))}
        />
      </PanelSection>
      {environment ? (
        <PanelSection
          className="model-preview__inspector-section"
          density="compact"
          disabled={disabled}
          title={t('preview.model.panoramaOrientation')}
        >
          {(
            [
              ['yawDeg', -180, 180, t('preview.model.panoramaYaw')],
              ['pitchDeg', -90, 90, t('preview.model.panoramaPitch')],
              ['fieldOfViewDeg', 30, 120, t('preview.model.fieldOfView')],
            ] as const
          ).map(([property, min, max, label]) => (
            <SliderPropertyRow
              key={property}
              density="compact"
              disabled={disabled}
              id={`reference-panorama-${property}`}
              label={label}
              min={min}
              max={max}
              step={1}
              value={environment.orientation[property]}
              onCommit={(_, value) =>
                onPanoramaOrientationChange({
                  ...environment.orientation,
                  [property]: value,
                })
              }
            />
          ))}
        </PanelSection>
      ) : null}
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
        {outputPreview ? (
          <img
            className="model-preview__output-preview"
            src={outputPreview}
            alt={t('preview.model.outputPreview')}
          />
        ) : null}
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
  onSelectedJointGroupChange,
  pose,
  poseControlMode,
  selectedJoint,
  selectedJointGroup,
  selectedJointId,
  visibleJoints,
}: {
  readonly capabilities?: {
    readonly posePresets: readonly ThreeReferenceRuntimePosePreset[];
    readonly joints: readonly ThreeReferenceRuntimeJointConstraint[];
  };
  readonly disabled: boolean;
  readonly jointRotation: { readonly x: number; readonly y: number; readonly z: number };
  readonly pose?: ThreeReferencePoseState;
  readonly poseControlMode: ThreeReferencePoseControlMode;
  readonly selectedJoint?: ThreeReferenceRuntimeJointConstraint;
  readonly selectedJointGroup: PoseJointGroup;
  readonly selectedJointId: string;
  readonly visibleJoints: readonly ThreeReferenceRuntimeJointConstraint[];
  readonly onCapture: () => void;
  readonly onJointChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  readonly onPoseChange: (pose: ThreeReferencePoseState) => void;
  readonly onPoseControlModeChange: (mode: ThreeReferencePoseControlMode) => void;
  readonly onSelectedJointChange: (jointId: string) => void;
  readonly onSelectedJointGroupChange: (group: PoseJointGroup) => void;
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
      >
        <span aria-hidden="true" />
      </PanelSection>
    );
  }
  return (
    <PanelSection
      className="model-preview__inspector-section"
      density="compact"
      disabled={disabled}
      title={t('preview.model.pose')}
    >
      <div className="model-preview__pose-presets" aria-label={t('preview.model.posePreset')}>
        {capabilities.posePresets.map((preset) => (
          <button
            key={preset.poseId}
            className="model-preview__pose-card"
            type="button"
            aria-pressed={pose.poseId === preset.poseId}
            disabled={disabled}
            onClick={() => onPoseChange({ poseId: preset.poseId, joints: preset.joints })}
          >
            <PosePresetThumbnail preset={preset} />
            <span>{t(preset.labelKey)}</span>
            {pose.poseId === preset.poseId ? (
              <span className={toCodiconClassName('check')} aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </div>
      <SelectPropertyRow
        density="compact"
        disabled={disabled}
        id="reference-pose-joint-group"
        label={t('preview.model.poseJointGroup')}
        options={(['body', 'torso', 'head', 'arms', 'legs'] as const).map((group) => ({
          value: group,
          label: t(`preview.model.poseJointGroup.${group}`),
        }))}
        value={selectedJointGroup}
        onCommit={(_, group) => onSelectedJointGroupChange(requirePoseJointGroup(group))}
      />
      <SelectPropertyRow
        density="compact"
        disabled={disabled}
        id="reference-pose-joint"
        label={t('preview.model.poseJoint')}
        options={visibleJoints.map((joint) => ({
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

function PosePresetThumbnail({
  preset,
}: {
  readonly preset: ThreeReferenceRuntimePosePreset;
}): React.JSX.Element {
  const rotations = new Map(preset.joints.map((joint) => [joint.jointId, joint.rotation]));
  const shoulderY = 19;
  const hipY = 39;
  const leftShoulder = { x: 18, y: shoulderY };
  const rightShoulder = { x: 30, y: shoulderY };
  const leftElbow = poseEndpoint(leftShoulder, 10, Math.PI + poseAngle(rotations, 'leftShoulder'));
  const rightElbow = poseEndpoint(rightShoulder, 10, poseAngle(rotations, 'rightShoulder'));
  const leftWrist = poseEndpoint(
    leftElbow,
    9,
    Math.PI + poseAngle(rotations, 'leftShoulder') + poseAngle(rotations, 'leftElbow'),
  );
  const rightWrist = poseEndpoint(
    rightElbow,
    9,
    poseAngle(rotations, 'rightShoulder') + poseAngle(rotations, 'rightElbow'),
  );
  const leftHip = { x: 21, y: hipY };
  const rightHip = { x: 27, y: hipY };
  const leftKnee = poseEndpoint(leftHip, 11, Math.PI / 2 + poseAngle(rotations, 'leftHip'));
  const rightKnee = poseEndpoint(rightHip, 11, Math.PI / 2 - poseAngle(rotations, 'rightHip'));
  const leftAnkle = poseEndpoint(
    leftKnee,
    10,
    Math.PI / 2 + poseAngle(rotations, 'leftHip') - poseAngle(rotations, 'leftKnee'),
  );
  const rightAnkle = poseEndpoint(
    rightKnee,
    10,
    Math.PI / 2 - poseAngle(rotations, 'rightHip') + poseAngle(rotations, 'rightKnee'),
  );
  return (
    <svg className="model-preview__pose-thumbnail" viewBox="0 0 48 64" aria-hidden="true">
      <circle cx="24" cy="9" r="5" />
      <path d="M24 14 L24 38 M18 19 L30 19 M21 39 L27 39" />
      <PoseLine from={leftShoulder} to={leftElbow} />
      <PoseLine from={leftElbow} to={leftWrist} />
      <PoseLine from={rightShoulder} to={rightElbow} />
      <PoseLine from={rightElbow} to={rightWrist} />
      <PoseLine from={leftHip} to={leftKnee} />
      <PoseLine from={leftKnee} to={leftAnkle} />
      <PoseLine from={rightHip} to={rightKnee} />
      <PoseLine from={rightKnee} to={rightAnkle} />
    </svg>
  );
}

function PoseLine({
  from,
  to,
}: {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}): React.JSX.Element {
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
}

function poseAngle(
  rotations: ReadonlyMap<string, { readonly x: number; readonly y: number; readonly z: number }>,
  jointId: string,
): number {
  const rotation = rotations.get(jointId);
  return rotation ? rotation.z + rotation.x * 0.45 + rotation.y * 0.2 : 0;
}

function poseEndpoint(
  start: { readonly x: number; readonly y: number },
  length: number,
  angle: number,
): { readonly x: number; readonly y: number } {
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
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

function requirePoseJointGroup(value: string): PoseJointGroup {
  if (
    value === 'body' ||
    value === 'torso' ||
    value === 'head' ||
    value === 'arms' ||
    value === 'legs'
  ) {
    return value;
  }
  throw new Error(`Unknown 3D Reference pose joint group: ${value}`);
}

function poseJointGroupOf(jointId: string): PoseJointGroup {
  if (jointId === 'hips') return 'body';
  if (jointId === 'spine' || jointId === 'chest') return 'torso';
  if (jointId === 'head') return 'head';
  if (jointId.includes('Shoulder') || jointId.includes('Elbow') || jointId.includes('Wrist')) {
    return 'arms';
  }
  if (jointId.includes('Hip') || jointId.includes('Knee') || jointId.includes('Ankle')) {
    return 'legs';
  }
  throw new Error(`Unknown 3D Reference mannequin joint group: ${jointId}`);
}

function requirePositiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid 3D Reference aspect ratio: ${value}`);
  }
  return parsed;
}
