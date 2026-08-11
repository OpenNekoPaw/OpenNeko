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

export function GenerationNode({ node, isSelected, ...baseProps }: GenerationNodeProps) {
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
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const elapsed = useGenerationElapsed(projection, active);

  useEffect(() => {
    if (imageGroup.length < 2) setComparisonOpen(false);
  }, [imageGroup.length]);

  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      className="canvas-generation-node-frame"
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
              <div className="canvas-generation-node__text-output">{textOutput}</div>
            ) : (
              <EmptyGenerationContent kind={recipe.kind} />
            )
          ) : previewSource ? (
            recipe.kind === 'image' && imageGroup.length > 1 ? (
              <ImageResultGroup
                nodeId={node.id}
                outputs={imageGroup}
                selectedOutputId={selected?.outputId}
                title={title}
                comparisonOpen={comparisonOpen}
                active={active}
                onToggleComparison={() => setComparisonOpen((open) => !open)}
                onSelect={(outputId) => {
                  void host?.selectGenerationOutput(node.id, outputId);
                }}
              />
            ) : (
              <div className="canvas-generation-node__single-preview">
                <PreviewSurface
                  source={previewSource}
                  surfaceKind="inline"
                  chrome="full-bleed"
                  audioLayout={recipe.kind === 'audio' ? 'node-card' : undefined}
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

function ImageResultGroup({
  nodeId,
  outputs,
  selectedOutputId,
  title,
  comparisonOpen,
  active,
  onToggleComparison,
  onSelect,
}: {
  readonly nodeId: string;
  readonly outputs: readonly CanvasGenerationOutputBinding[];
  readonly selectedOutputId?: string;
  readonly title: string;
  readonly comparisonOpen: boolean;
  readonly active: boolean;
  readonly onToggleComparison: () => void;
  readonly onSelect: (outputId: string) => void;
}) {
  const selectedIndex = Math.max(
    0,
    outputs.findIndex((output) => output.outputId === selectedOutputId),
  );
  const selected = outputs[selectedIndex];

  return (
    <div
      className="canvas-generation-node__result-stack canvas-generation-node__result-stack--multiple"
      data-generation-result-count={outputs.length}
      data-generation-comparison={comparisonOpen ? 'open' : 'closed'}
    >
      {comparisonOpen ? (
        <div className="canvas-generation-node__comparison" role="list">
          {outputs.map((output, index) => (
            <button
              key={output.outputId}
              type="button"
              className="canvas-generation-node__comparison-item nodrag nowheel"
              aria-current={output.outputId === selectedOutputId ? 'true' : undefined}
              aria-label={t('generation.selectOutput', { number: index + 1 })}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(output.outputId);
              }}
            >
              <PreviewSurface
                source={previewSourceFor(nodeId, output, title)!}
                surfaceKind="inline"
                chrome="full-bleed"
              />
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
      ) : selected ? (
        <div className="canvas-generation-node__group-primary">
          <PreviewSurface
            source={previewSourceFor(nodeId, selected, title)!}
            surfaceKind="inline"
            chrome="full-bleed"
          />
        </div>
      ) : null}
      {active ? <ActivityScan /> : null}
      <button
        type="button"
        className="canvas-generation-node__count-badge nodrag"
        aria-expanded={comparisonOpen}
        aria-label={t(comparisonOpen ? 'generation.collapseOutputs' : 'generation.compareOutputs')}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggleComparison();
        }}
      >
        {t('generation.outputCount', { count: outputs.length })}
      </button>
      <span className="canvas-generation-node__result-index">
        {selectedIndex + 1}/{outputs.length}
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
      {elapsed ? <span aria-label={t('generation.elapsed')}>{elapsed}</span> : null}
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
