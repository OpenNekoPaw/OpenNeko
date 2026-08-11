import type { PreviewMediaDescriptor } from '@neko/preview-domain';
import { QuickPreviewSurface } from '@neko/preview-webview/embedded';
import { memo } from 'react';
import { getLocale } from '../../../i18n';

interface AgentPreviewCollectionProps {
  readonly descriptors: readonly PreviewMediaDescriptor[];
  readonly className?: string;
}

function AgentPreviewCollectionComponent({ descriptors, className }: AgentPreviewCollectionProps) {
  if (descriptors.length === 0) return null;
  const imageGrid = descriptors.every((descriptor) => descriptor.contentKind === 'image');
  return (
    <div
      className={`${imageGrid ? 'grid grid-cols-2 gap-1' : 'space-y-2'} ${className ?? ''}`}
      data-agent-preview-collection="true"
      data-agent-preview-count={descriptors.length}
    >
      {descriptors.map((descriptor) => (
        <div
          key={descriptor.descriptorId}
          className={imageGrid ? 'min-w-0 overflow-hidden rounded' : 'min-w-0'}
          data-agent-preview-item={descriptor.contentKind}
        >
          <QuickPreviewSurface descriptor={descriptor} locale={getLocale()} />
        </div>
      ))}
    </div>
  );
}

export const AgentPreviewCollection = memo(AgentPreviewCollectionComponent);
