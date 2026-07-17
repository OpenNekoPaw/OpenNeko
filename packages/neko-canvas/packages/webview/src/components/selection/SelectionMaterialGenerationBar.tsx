import { useMemo, type ReactNode } from 'react';
import type { CanvasNode, CanvasViewport } from '@neko/shared';
import { Button } from '@neko/ui/primitives';
import { RefreshIcon } from '@neko/shared/icons';
import { useCanvasStore } from '../../stores/canvasStore';
import { t } from '../../i18n';
import {
  resolveCanvasMaterialPresentation,
  type CanvasMaterialGenerationPresentation,
} from './materialPresentation';

interface SelectionMaterialGenerationBarProps {
  readonly nodes: readonly CanvasNode[];
  readonly selectedNodeIds: readonly string[];
  readonly viewport: CanvasViewport;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly hidden?: boolean;
}

export function SelectionMaterialGenerationBar({
  nodes,
  selectedNodeIds,
  viewport,
  viewportSize,
  hidden = false,
}: SelectionMaterialGenerationBarProps): ReactNode {
  const selectedNode =
    selectedNodeIds.length === 1
      ? nodes.find((candidate) => candidate.id === selectedNodeIds[0])
      : undefined;
  const material = useMemo(
    () => (selectedNode ? resolveCanvasMaterialPresentation(selectedNode, nodes) : undefined),
    [nodes, selectedNode],
  );
  if (hidden || !selectedNode || material?.source !== 'generated' || !material.generation) {
    return null;
  }

  const generation = material.generation;
  const generationTargetNodeId = generation.targetNodeId;
  const position = resolveGenerationBarPosition(selectedNode, viewport, viewportSize);
  const summary = formatGenerationSummary(generation);

  return (
    <div
      className="selection-material-generation-bar"
      data-material-generation-context="true"
      data-material-generation-target={generation.targetNodeId ?? ''}
      style={{ left: position.x, top: position.y, width: position.width }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="selection-material-generation-copy">
        <div className="selection-material-generation-heading">
          <span>{t('material.generatedContext')}</span>
          {summary && <span className="selection-material-generation-meta">{summary}</span>}
        </div>
        <div
          className="selection-material-generation-prompt"
          title={generation.prompt ?? t('material.promptUnavailable')}
        >
          {generation.prompt ?? t('material.promptUnavailable')}
        </div>
      </div>
      {generationTargetNodeId && (
        <Button
          data-material-generation-action="open-generation-panel"
          size="xs"
          variant="default"
          leadingIcon={<RefreshIcon size={14} />}
          onClick={() =>
            useCanvasStore
              .getState()
              .openGenerationPanel(generationTargetNodeId, undefined, generation.prompt, {
                generateVideo: material.mediaType === 'video',
              })
          }
        >
          {t('material.generateAgain')}
        </Button>
      )}
    </div>
  );
}

function resolveGenerationBarPosition(
  node: CanvasNode,
  viewport: CanvasViewport,
  viewportSize: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number; readonly width: number } {
  const preferredWidth = Math.min(560, Math.max(420, node.size.width * viewport.zoom));
  const width = Math.min(preferredWidth, Math.max(240, viewportSize.width - 24));
  const centerX = viewport.pan.x + (node.position.x + node.size.width / 2) * viewport.zoom;
  const preferredY = viewport.pan.y + (node.position.y + node.size.height) * viewport.zoom + 12;
  return {
    x: Math.max(12 + width / 2, Math.min(viewportSize.width - 12 - width / 2, centerX)),
    y: Math.max(52, Math.min(viewportSize.height - 104, preferredY)),
    width,
  };
}

function formatGenerationSummary(context: CanvasMaterialGenerationPresentation): string {
  return [
    context.model,
    context.aspectRatio,
    context.width && context.height ? `${context.width}×${context.height}` : undefined,
    context.duration ? `${context.duration}s` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}
