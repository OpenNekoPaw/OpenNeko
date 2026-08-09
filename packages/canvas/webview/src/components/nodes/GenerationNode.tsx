import { selectedCanvasGenerationOutput, type GenerationCanvasNode } from '@neko/canvas-domain';
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
  const title = t(`generation.kind.${recipe.kind}`);
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
      <div className="flex h-full min-h-0 flex-col" data-canvas-generation-node={recipe.kind}>
        <div
          className="flex items-center justify-between border-b px-2 py-1.5"
          style={{ borderColor: 'var(--node-divider)' }}
        >
          <strong className="truncate text-xs" style={{ color: 'var(--node-fg)' }}>
            {title}
          </strong>
          <span className="text-[10px]" style={{ color: 'var(--node-fg-secondary)' }}>
            {projection ? t(`generation.phase.${projection.phase}`) : t('generation.phase.idle')}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {recipe.kind === 'prompt' ? (
            <div
              className="h-full overflow-auto whitespace-pre-wrap p-2 text-xs leading-5"
              style={{ color: 'var(--node-fg)' }}
            >
              {node.data.authoredText?.text ??
                projection?.text ??
                (selected ? t('generation.textUnavailable') : t('generation.empty'))}
            </div>
          ) : previewSource ? (
            <PreviewSurface
              source={previewSource}
              surfaceKind="inline"
              chrome="full-bleed"
              audioLayout={recipe.kind === 'audio' ? 'node-card' : undefined}
            />
          ) : (
            <div
              className="flex h-full items-center justify-center px-3 text-center text-xs"
              style={{ color: 'var(--node-fg-secondary)' }}
            >
              {t('generation.empty')}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}
