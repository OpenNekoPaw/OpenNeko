import { selectedCanvasGenerationOutput, type CanvasNode } from '@neko/canvas-domain';
import { CloseIcon } from '@neko/ui/icons';
import { IconButton } from '@neko/ui/primitives';
import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type { PreviewSourceDescriptor } from '../../preview/types';

export type CanvasImagePreviewSource = PreviewSourceDescriptor & { readonly role: 'image' };

export function resolveCanvasImagePreviewSource(
  node: CanvasNode,
): CanvasImagePreviewSource | undefined {
  if (node.type === 'generation') {
    const output = selectedCanvasGenerationOutput(node.data);
    if (!output || output.kind !== 'image') return undefined;
    return {
      id: `canvas-fullscreen:generation:${node.id}:${output.outputId}`,
      role: 'image',
      title: node.data.recipe.prompt || t('node.image'),
      asset: { kind: 'asset-identity', mediaType: 'image' },
      contentLocator: output.locator,
      metadata: {},
    };
  }

  if (node.type === 'media' && node.data.mediaType === 'image' && node.data.contentLocator) {
    return {
      id: `canvas-fullscreen:media:${node.id}`,
      role: 'image',
      title: node.data.title || basename(node.data.assetPath) || t('node.image'),
      asset: {
        kind: 'asset-identity',
        mediaType: 'image',
        ...(node.data.runtimeAssetPath || node.data.assetPath
          ? { path: node.data.runtimeAssetPath || node.data.assetPath }
          : {}),
      },
      contentLocator: node.data.contentLocator,
      metadata: {},
    };
  }

  if (node.type === 'file' && node.data.mediaKind === 'image' && node.data.contentLocator) {
    return {
      id: `canvas-fullscreen:file:${node.id}`,
      role: 'image',
      title: basename(node.data.title) || basename(node.data.path) || t('node.image'),
      asset: { kind: 'asset-identity', mediaType: 'image' },
      contentLocator: node.data.contentLocator,
      metadata: {},
    };
  }

  return undefined;
}

export function CanvasImagePreviewOverlay({
  source,
  onClose,
}: {
  readonly source: CanvasImagePreviewSource;
  readonly onClose: () => void;
}): ReactNode {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="canvas-image-preview-overlay"
      data-canvas-image-preview="true"
      role="dialog"
      aria-modal="true"
      aria-label={t('selection.imagePreview')}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="canvas-image-preview-overlay__toolbar">
        <span className="canvas-image-preview-overlay__title">{source.title}</span>
        <IconButton
          size="sm"
          variant="ghost"
          icon={<CloseIcon size={16} />}
          label={t('selection.closeImagePreview')}
          title={t('selection.closeImagePreview')}
          onClick={onClose}
        />
      </div>
      <div className="canvas-image-preview-overlay__content">
        <PreviewSurface source={source} surfaceKind="overlay" chrome="full-bleed" />
      </div>
    </div>
  );
}

function basename(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/u, '');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).trim();
  return name || undefined;
}
