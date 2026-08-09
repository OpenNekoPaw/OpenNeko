import { selectedCanvasGenerationOutput, type GenerationCanvasNode } from '@neko/canvas-domain';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import { useMemo } from 'react';
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
  const previewSource = useMemo<PreviewSourceDescriptor | undefined>(() => {
    if (!selected || selected.kind === 'prompt') return undefined;
    return {
      id: `canvas-generation:${node.id}:${selected.outputId}`,
      role:
        selected.kind === 'image'
          ? 'image'
          : selected.kind === 'video'
            ? 'video-proxy'
            : 'audio-waveform',
      title,
      asset: { kind: 'asset-identity', mediaType: selected.kind },
      contentLocator: selected.locator,
      metadata: {},
    };
  }, [node.id, selected, title]);

  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
    >
      <div
        className="canvas-generation-node"
        data-canvas-generation-node={recipe.kind}
        data-canvas-content-kind={recipe.kind === 'prompt' ? 'text' : recipe.kind}
      >
        <div className="canvas-generation-node__label">
          <span
            aria-hidden="true"
            className={toCodiconClassName(generationContentIcon(recipe.kind))}
          />
          <span>{title}</span>
        </div>
        <div className="canvas-generation-node__content">
          {recipe.kind === 'prompt' ? (
            textOutput ? (
              <div className="canvas-generation-node__text-output">{textOutput}</div>
            ) : (
              <EmptyGenerationContent kind={recipe.kind} />
            )
          ) : previewSource ? (
            <PreviewSurface
              source={previewSource}
              surfaceKind="inline"
              chrome="full-bleed"
              audioLayout={recipe.kind === 'audio' ? 'node-card' : undefined}
            />
          ) : (
            <EmptyGenerationContent kind={recipe.kind} />
          )}
        </div>
        {active && projection ? (
          <div className="canvas-generation-node__phase" role="status">
            {t(`generation.phase.${projection.phase}`)}
          </div>
        ) : null}
      </div>
    </BaseNode>
  );
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
