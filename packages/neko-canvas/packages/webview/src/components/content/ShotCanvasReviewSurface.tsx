import React, { useMemo } from 'react';
import type {
  CanvasAuthoringDiagnostic,
  CanvasNode,
  CanvasStoryboardActionIntentId,
  CanvasStoryboardNextCreativeStateSeverity,
  CanvasStoryboardPromptBlockKind,
  CanvasStoryboardPromptState,
  CanvasStoryboardReviewRow,
  CanvasStoryboardSemanticPromptDocument,
} from '@neko/shared';
import {
  getNodeParentId,
  isCanvasStoryboardPromptState,
  projectCanvasStoryboardReviewRow,
} from '@neko/shared';
import { SemanticPromptText } from '../common/SemanticPromptText';
import type { NodeContentRenderContext } from './types';
import {
  CardPreviewSlot,
  readNumber,
  readString,
  resolveShotReviewPreviewSource,
} from './node-card';
import { t } from '../../i18n';
import { resolveCanvasOptionLabel } from '../../i18n/canvasValueLabels';

export interface ShotCanvasReviewSurfaceProps {
  readonly context: NodeContentRenderContext;
}

interface ShotPromptBlockView {
  readonly kind: CanvasStoryboardPromptBlockKind;
  readonly label: string;
  readonly value: string;
  readonly document?: CanvasStoryboardSemanticPromptDocument;
  readonly placeholder: string;
}

export function ShotCanvasReviewSurface({
  context,
}: ShotCanvasReviewSurfaceProps): React.ReactNode {
  const { node } = context;
  const parentSceneId = useMemo(
    () => resolveParentSceneId(node, context.allNodes),
    [context.allNodes, node],
  );
  const reviewRow = useMemo(
    () =>
      projectCanvasStoryboardReviewRow({
        nodeId: node.id,
        ...(parentSceneId ? { sceneNodeId: parentSceneId } : {}),
        data: node.data,
      }),
    [node.data, node.id, parentSceneId],
  );
  const promptState = useMemo(() => readStoryboardPromptState(node), [node]);
  const previewSource = useMemo(() => resolveShotReviewPreviewSource(node), [node]);
  const promptBlocks = createPromptBlockViews(reviewRow, promptState);
  const metaItems = createShotReviewMetaItems(node, reviewRow);
  const stateLabel = formatSceneShotStateLabel(reviewRow.state.id, reviewRow.state.label);
  const stateTargetLabel = formatSceneShotStateTargetLabel(reviewRow.state.target);
  const actionLabel = formatSceneShotActionLabel(reviewRow.actionId);
  const diagnostic = firstPromptDiagnostic(reviewRow, promptState);
  const isCompact = context.layout.density === 'compact';

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 text-xs text-gray-700"
      data-shot-canvas-review-surface="true"
      data-shot-canvas-review-source={reviewRow.source}
    >
      <div
        className={
          isCompact
            ? 'flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden'
            : 'grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(116px,0.34fr)_minmax(0,0.66fr)] gap-2 overflow-hidden'
        }
      >
        <section
          className="min-h-0 min-w-0 overflow-hidden rounded border border-gray-200 bg-gray-50"
          data-shot-canvas-review-preview="true"
        >
          <CardPreviewSlot
            source={previewSource}
            title={reviewRow.shotNumber}
            variant="summary-large"
            interactionRenderMode={context.interactionRenderMode}
            imageFit="contain"
          />
        </section>
        <section
          className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden"
          data-shot-canvas-review-prompts="true"
        >
          <ShotReviewStateStrip
            reviewRow={reviewRow}
            stateLabel={stateLabel}
            stateTargetLabel={stateTargetLabel}
            actionLabel={actionLabel}
          />
          <div className="grid min-w-0 grid-cols-2 gap-1.5">
            {metaItems.map((item) => (
              <ShotReviewMetaItem key={item.id} {...item} />
            ))}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden">
            {promptBlocks.map((block) => (
              <ShotPromptBlock key={block.kind} block={block} />
            ))}
          </div>
        </section>
      </div>
      {diagnostic ? <ShotReviewDiagnostic diagnostic={diagnostic} /> : null}
    </div>
  );
}

function ShotReviewStateStrip({
  reviewRow,
  stateLabel,
  stateTargetLabel,
  actionLabel,
}: {
  reviewRow: CanvasStoryboardReviewRow;
  stateLabel: string;
  stateTargetLabel: string;
  actionLabel: string;
}): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span
        className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-gray-600"
        data-shot-canvas-review-shot-number="true"
      >
        {reviewRow.shotNumber}
      </span>
      <span
        className={getStateBadgeClassName(reviewRow.state.severity)}
        data-shot-canvas-review-state-id={reviewRow.state.id}
        title={stateTargetLabel || stateLabel}
      >
        {stateLabel}
      </span>
      {actionLabel ? (
        <span
          className="inline-flex max-w-full rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] leading-none text-blue-700"
          data-shot-canvas-review-action-id={reviewRow.actionId}
          title={t('scene.nextActionControl')}
        >
          <span className="truncate">{actionLabel}</span>
        </span>
      ) : null}
    </div>
  );
}

function ShotReviewMetaItem({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div
      className="min-w-0 rounded border border-gray-200 bg-white px-1.5 py-1"
      data-shot-canvas-review-field={id}
      title={value || t('scene.valueUnavailable')}
    >
      <div className="mb-0.5 truncate text-[10px] text-gray-500">{label}</div>
      <div className="line-clamp-2 break-words text-[11px] leading-[1.35] text-gray-800">
        {value || <span className="text-gray-400">{t('scene.valueUnavailable')}</span>}
      </div>
    </div>
  );
}

function ShotPromptBlock({ block }: { block: ShotPromptBlockView }): React.ReactNode {
  return (
    <div
      className="min-h-0 min-w-0 rounded border border-gray-200 bg-white px-2 py-1.5"
      data-shot-canvas-review-block={block.kind}
    >
      <div className="mb-1 truncate text-[10px] text-gray-500">{block.label}</div>
      <SemanticPromptText
        text={block.document?.text ?? block.value}
        spans={block.document?.spans}
        placeholder={block.placeholder}
        ariaLabel={block.label}
        className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-[1.4] text-gray-800"
        placeholderClassName="text-gray-400"
      />
    </div>
  );
}

function ShotReviewDiagnostic({
  diagnostic,
}: {
  diagnostic: CanvasAuthoringDiagnostic;
}): React.ReactNode {
  return (
    <div
      className={getDiagnosticClassName(diagnostic.severity)}
      data-shot-canvas-review-diagnostic={diagnostic.code}
    >
      {diagnostic.message}
    </div>
  );
}

function createPromptBlockViews(
  reviewRow: CanvasStoryboardReviewRow,
  promptState: CanvasStoryboardPromptState | undefined,
): readonly ShotPromptBlockView[] {
  const blocks = promptState?.promptBlocks;
  return [
    {
      kind: 'video',
      label: t('content.overlayShotPromptBlockVideo'),
      value: reviewRow.videoPrompt,
      document: blocks?.videoPromptDocument,
      placeholder: t('content.overlayShotPromptVideoPlaceholder'),
    },
    {
      kind: 'image',
      label: t('content.overlayShotPromptBlockImage'),
      value: reviewRow.imagePrompt,
      document: blocks?.imagePromptDocument,
      placeholder: t('scene.imagePromptSkipped'),
    },
    {
      kind: 'voice',
      label: t('content.overlayShotPromptBlockVoice'),
      value: blocks?.voicePromptDocument?.text ?? reviewRow.dialogue,
      document: blocks?.voicePromptDocument,
      placeholder: t('scene.noDialogue'),
    },
  ];
}

function createShotReviewMetaItems(
  node: CanvasNode,
  reviewRow: CanvasStoryboardReviewRow,
): Array<{ id: string; label: string; value: string }> {
  const camera = joinDisplayValues([
    formatCanvasOption('/shotScale', readString(node.data, 'shotScale')),
    formatCanvasOption('/cameraMovement', readString(node.data, 'cameraMovement')),
    formatCanvasOption('/cameraAngle', readString(node.data, 'cameraAngle')),
  ]);
  const duration = reviewRow.duration || formatDuration(readNumber(node.data, 'duration'));
  return [
    {
      id: 'reference-media',
      label: t('scene.column.referenceMedia'),
      value: reviewRow.referenceMedia,
    },
    {
      id: 'duration',
      label: t('scene.column.duration'),
      value: duration,
    },
    {
      id: 'dialogue',
      label: t('scene.column.dialogue'),
      value: reviewRow.dialogue,
    },
    {
      id: 'camera',
      label: t('scene.column.camera'),
      value: camera,
    },
  ];
}

function readStoryboardPromptState(node: CanvasNode): CanvasStoryboardPromptState | undefined {
  const state = readRecordValue(node.data)['storyboardPrompt'];
  return isCanvasStoryboardPromptState(state) ? state : undefined;
}

function resolveParentSceneId(
  node: CanvasNode,
  allNodes: readonly CanvasNode[],
): string | undefined {
  const parentId = getNodeParentId(node);
  if (!parentId) return undefined;
  return allNodes.find((candidate) => candidate.id === parentId && candidate.type === 'scene')?.id;
}

function firstPromptDiagnostic(
  reviewRow: CanvasStoryboardReviewRow,
  promptState: CanvasStoryboardPromptState | undefined,
): CanvasAuthoringDiagnostic | undefined {
  return (
    reviewRow.diagnostics.find((diagnostic) => diagnostic.severity !== 'info') ??
    promptState?.diagnostics?.find((diagnostic) => diagnostic.severity !== 'info') ??
    reviewRow.diagnostics[0] ??
    promptState?.diagnostics?.[0]
  );
}

function formatDuration(duration: number | undefined): string {
  return duration === undefined ? '' : t('scene.shotDuration', { seconds: duration });
}

function formatCanvasOption(path: string, value: string | undefined): string | undefined {
  return value ? resolveCanvasOptionLabel(path, value) : undefined;
}

function joinDisplayValues(values: readonly (string | undefined)[]): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

function readRecordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatSceneShotStateLabel(stateId: string, fallback: string): string {
  const value = t(`scene.nextState.${stateId}`);
  if (value !== `scene.nextState.${stateId}`) {
    return value;
  }
  return fallback || t('scene.statusNeedsAction');
}

function formatSceneShotStateTargetLabel(target: string): string {
  if (!target) return '';
  const value = t(`scene.stateTarget.${target}`);
  return value === `scene.stateTarget.${target}` ? target : value;
}

function formatSceneShotActionLabel(actionId: CanvasStoryboardActionIntentId | undefined): string {
  switch (actionId) {
    case 'process-reference':
      return t('scene.action.processReference');
    case 'optimize-image-prompt':
      return t('scene.action.optimizeImagePrompt');
    case 'optimize-video-prompt':
      return t('scene.action.optimizeVideoPrompt');
    case 'generate-image':
      return t('scene.action.generateImage');
    case 'generate-video':
      return t('scene.action.generateVideo');
    case 'review-result':
      return t('scene.action.reviewResult');
    case 'fix-alignment':
      return t('scene.action.fixAlignment');
    case 'accept-result':
      return t('scene.action.acceptResult');
    case 'retry':
      return t('scene.action.retry');
    case undefined:
      return '';
  }
}

function getStateBadgeClassName(severity: CanvasStoryboardNextCreativeStateSeverity): string {
  const base = 'inline-flex max-w-full rounded border px-1.5 py-0.5 text-[10px] leading-none';
  switch (severity) {
    case 'error':
    case 'blocked':
      return `${base} border-red-200 bg-red-50 text-red-700`;
    case 'warning':
      return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    case 'info':
      return `${base} border-gray-200 bg-gray-50 text-gray-600`;
  }
}

function getDiagnosticClassName(severity: CanvasAuthoringDiagnostic['severity']): string {
  const base = 'line-clamp-2 rounded border px-2 py-1 text-[11px] leading-4';
  switch (severity) {
    case 'error':
      return `${base} border-red-200 bg-red-50 text-red-700`;
    case 'warning':
      return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    case 'info':
      return `${base} border-blue-200 bg-blue-50 text-blue-700`;
  }
}
