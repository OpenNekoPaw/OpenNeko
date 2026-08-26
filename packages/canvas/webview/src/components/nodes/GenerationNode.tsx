import {
  selectedCanvasGenerationOutput,
  type CanvasGenerationOutputBinding,
  type CanvasGenerationRuntimeProjection,
  type GenerationCanvasNode,
} from '@neko/canvas-domain';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { useOptionalCanvasHost } from '../../host-runtime';
import { t } from '../../i18n';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type { PreviewSourceDescriptor } from '../../preview/types';
import { BaseNode } from './BaseNode';
import type { NodeRendererCommonProps } from './nodeRendererTypes';

type GenerationNodeProps = NodeRendererCommonProps & { readonly node: GenerationCanvasNode };

export function GenerationNode({
  node,
  isSelected,
  onFullscreenPreview,
  ...baseProps
}: GenerationNodeProps) {
  const host = useOptionalCanvasHost();
  const recipe = node.data.recipe;
  const projection = host?.getGenerationProjection(node.id);
  const selected = selectedCanvasGenerationOutput(node.data);
  const title = generationContentLabel(recipe.kind);
  const textOutput = node.data.authoredText?.text ?? projection?.text;
  const active =
    projection?.phase === 'binding' ||
    projection?.phase === 'pending' ||
    projection?.phase === 'running';
  const previewSource = useMemo(
    () => (selected ? previewSourceFor(node.id, selected, title) : undefined),
    [node.id, selected, title],
  );
  const imageGroup = useMemo(
    () =>
      selected?.kind === 'image'
        ? node.data.outputs.filter(
            (output) => output.kind === 'image' && output.jobRef.jobId === selected.jobRef.jobId,
          )
        : [],
    [node.data.outputs, selected],
  );
  const elapsed = useGenerationElapsed(projection, active);

  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      className="canvas-generation-node-frame"
      onActivate={
        selected && onFullscreenPreview
          ? () => onFullscreenPreview(node.id, selected.outputId)
          : undefined
      }
      nodeLabel={{
        icon: (
          <span
            aria-hidden="true"
            className={toCodiconClassName(generationContentIcon(recipe.kind))}
          />
        ),
        text: title,
      }}
    >
      <div
        className="canvas-generation-node"
        data-canvas-generation-node={recipe.kind}
        data-canvas-content-kind={recipe.kind === 'prompt' ? 'text' : recipe.kind}
      >
        <div className="canvas-generation-node__content">
          {recipe.kind === 'prompt' ? (
            textOutput ? (
              <div
                className="canvas-generation-node__text-output"
                data-canvas-wheel-owner="content"
              >
                {textOutput}
              </div>
            ) : (
              <EmptyGenerationContent kind={recipe.kind} />
            )
          ) : previewSource ? (
            recipe.kind === 'image' && imageGroup.length > 1 ? (
              <ImageResultGrid
                nodeId={node.id}
                outputs={imageGroup}
                selectedOutputId={selected?.outputId}
                title={title}
                active={active}
                onSelect={(outputId) => {
                  void host?.selectGenerationOutput(node.id, outputId);
                }}
                onPreview={onFullscreenPreview}
              />
            ) : (
              <div className="canvas-generation-node__single-preview">
                <PreviewSurface
                  source={previewSource}
                  surfaceKind="inline"
                  chrome="full-bleed"
                  audioLayout={recipe.kind === 'audio' ? 'node-card' : undefined}
                  mediaPlayback={recipe.kind === 'video' ? 'passive' : undefined}
                />
                {active ? <ActivityScan /> : null}
              </div>
            )
          ) : (
            <div
              className={`canvas-generation-node__result-stack${
                active && recipe.kind === 'image' && (recipe.count ?? 1) > 1
                  ? ' canvas-generation-node__result-stack--pending'
                  : ''
              }`}
            >
              <EmptyGenerationContent kind={recipe.kind} />
              {active ? <ActivityScan /> : null}
              {active && recipe.kind === 'image' && (recipe.count ?? 1) > 1 ? (
                <span className="canvas-generation-node__count-badge">
                  {t('generation.outputCount', { count: recipe.count ?? 1 })}
                </span>
              ) : null}
            </div>
          )}
        </div>
        {projection ? (
          <GenerationStatus projection={projection} active={active} elapsed={elapsed} />
        ) : null}
      </div>
    </BaseNode>
  );
}

function ImageResultGrid({
  nodeId,
  outputs,
  selectedOutputId,
  title,
  active,
  onSelect,
  onPreview,
}: {
  readonly nodeId: string;
  readonly outputs: readonly CanvasGenerationOutputBinding[];
  readonly selectedOutputId?: string;
  readonly title: string;
  readonly active: boolean;
  readonly onSelect: (outputId: string) => void;
  readonly onPreview?: (nodeId: string, outputId?: string) => void;
}) {
  return (
    <div
      className={`canvas-generation-node__result-grid${
        outputs.length > 2 ? ' canvas-generation-node__result-grid--dense' : ''
      }`}
      data-generation-result-count={outputs.length}
      data-generation-layout="grid"
      role="group"
      aria-label={t('generation.outputCount', { count: outputs.length })}
    >
      {outputs.map((output, index) => {
        const source = previewSourceFor(nodeId, output, title);
        if (!source) {
          throw new Error(
            `Canvas Image result grid received non-previewable output "${output.outputId}".`,
          );
        }
        return (
          <button
            key={output.outputId}
            type="button"
            className="canvas-generation-node__result-grid-item nodrag nowheel"
            data-generation-output-id={output.outputId}
            aria-pressed={output.outputId === selectedOutputId}
            aria-label={t('generation.selectOutput', { number: index + 1 })}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(output.outputId);
            }}
            onDoubleClick={(event) => {
              if (!onPreview) return;
              event.preventDefault();
              event.stopPropagation();
              onPreview(nodeId, output.outputId);
            }}
          >
            <PreviewSurface source={source} surfaceKind="inline" chrome="full-bleed" />
            <span>{index + 1}</span>
          </button>
        );
      })}
      {active ? <ActivityScan /> : null}
      <span className="canvas-generation-node__count-badge">
        {t('generation.outputCount', { count: outputs.length })}
      </span>
    </div>
  );
}

function GenerationStatus({
  projection,
  active,
  elapsed,
}: {
  readonly projection: CanvasGenerationRuntimeProjection;
  readonly active: boolean;
  readonly elapsed?: string;
}) {
  const stageKey = active && projection.progress ? projection.progress.stage : projection.phase;
  const percent = active ? projection.progress?.percent : undefined;
  const label = t(`generation.stage.${stageKey}`);
  return (
    <div
      className="canvas-generation-node__status"
      data-generation-phase={projection.phase}
      data-tone={
        projection.phase === 'failed' || projection.phase === 'outcome-unknown'
          ? 'danger'
          : projection.phase === 'cancelled'
            ? 'muted'
            : 'neutral'
      }
      role="status"
      title={projection.diagnostic?.message}
    >
      <span>{label}</span>
      {elapsed ? (
        <span aria-label={t('generation.elapsed')}>
          {t('generation.elapsedValue', { elapsed })}
        </span>
      ) : null}
      {percent !== undefined ? <span>{Math.round(percent)}%</span> : null}
      {active && percent !== undefined ? (
        <span className="canvas-generation-node__progress" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </span>
      ) : null}
    </div>
  );
}

function ActivityScan() {
  return <span className="canvas-generation-node__activity-scan" aria-hidden="true" />;
}

function useGenerationElapsed(
  projection: CanvasGenerationRuntimeProjection | undefined,
  active: boolean,
): string | undefined {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || projection?.createdAt === undefined) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [active, projection?.createdAt]);
  if (projection?.createdAt === undefined) return undefined;
  const end = active ? Date.now() : projection.updatedAt;
  if (end === undefined) return undefined;
  return formatElapsed(Math.max(0, end - projection.createdAt));
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function previewSourceFor(
  nodeId: string,
  output: CanvasGenerationOutputBinding,
  title: string,
): PreviewSourceDescriptor | undefined {
  if (output.kind === 'prompt') return undefined;
  return {
    id: `canvas-generation:${nodeId}:${output.outputId}`,
    nodeId,
    outputId: output.outputId,
    role:
      output.kind === 'image'
        ? 'image'
        : output.kind === 'video'
          ? 'video-proxy'
          : 'audio-waveform',
    title,
    asset: { kind: 'asset-identity', mediaType: output.kind },
    contentLocator: output.locator,
    metadata: {},
  };
}

function EmptyGenerationContent({
  kind,
}: {
  readonly kind: GenerationCanvasNode['data']['recipe']['kind'];
}) {
  return (
    <div className="canvas-generation-node__empty" role="status">
      <span aria-hidden="true" className={toCodiconClassName(generationContentIcon(kind))} />
      <span className="sr-only">{t('generation.empty')}</span>
    </div>
  );
}

function generationContentLabel(kind: GenerationCanvasNode['data']['recipe']['kind']): string {
  switch (kind) {
    case 'prompt':
      return t('node.text');
    case 'image':
      return t('node.image');
    case 'audio':
      return t('node.audio');
    case 'video':
      return t('node.video');
  }
}

function generationContentIcon(kind: GenerationCanvasNode['data']['recipe']['kind']): CodiconName {
  switch (kind) {
    case 'prompt':
      return 'file-text';
    case 'image':
      return 'file-media';
    case 'audio':
      return 'music';
    case 'video':
      return 'play';
  }
}
