/**
 * ImageGridCard - Responsive grid for multiple generated images (ADR-3)
 *
 * Replaces single ImagePreview when a task produces multiple outputs.
 * Displays 2-3 column grid with click-to-open and selection highlighting.
 */

import { useState, useCallback, memo } from 'react';
import { AgentHostMessages } from '@/messages';
import { openMediaTarget } from './openMediaTarget';

interface ImageGridCardProps {
  /** Webview-safe image URIs */
  urls: string[];
  /** Original local file paths (parallel array) */
  localPaths?: string[];
  /** Task or batch name shown in header */
  name?: string;
  /** Whether clicking an image should request the host to open it. */
  openOnClick?: boolean;
  className?: string;
}

function ImageGridCardComponent({
  urls,
  localPaths,
  name,
  openOnClick = true,
  className,
}: ImageGridCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleOpen = useCallback(
    (index: number) => {
      if (!openOnClick) return;
      const localPath = localPaths?.[index];
      const src = localPath ?? urls[index];
      if (!src) return;

      openMediaTarget(src);
    },
    [localPaths, openOnClick, urls],
  );

  /** Notify Extension Host that a drag operation started (ADR-5 P1 DnD). */
  const handleDragStart = useCallback(
    (index: number) => {
      const localPath = localPaths?.[index];
      if (!localPath) return;
      const fileName = localPath.split(/[\\/]/).pop() ?? 'image';
      AgentHostMessages.dndStart({ path: localPath, mediaType: 'image', name: fileName });
    },
    [localPaths],
  );

  if (urls.length === 0) return null;

  // Single image — delegate to simple view
  if (urls.length === 1) {
    const src = urls[0];
    if (!src) return null;
    return (
      <div className={`rounded overflow-hidden ${className ?? ''}`}>
        <img
          src={src}
          alt={name ?? 'Generated image'}
          className={`w-full max-h-[200px] object-contain transition-opacity ${openOnClick ? 'cursor-pointer hover:opacity-90' : ''}`}
          draggable={!!localPaths?.[0]}
          onDragStart={() => handleDragStart(0)}
          onClick={openOnClick ? () => handleOpen(0) : undefined}
          loading="lazy"
        />
      </div>
    );
  }

  // Determine grid columns: 2 for 2-3 images, 3 for 4+
  const cols = urls.length <= 3 ? 2 : 3;

  return (
    <div className={className ?? ''}>
      {/* Grid */}
      <div
        className="grid gap-1 rounded overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {urls.map((url, index) => {
          if (!url) return null;
          const isSelected = selectedIndex === index;
          return (
            <div
              key={`img-${index}`}
              className={`relative group overflow-hidden rounded ${openOnClick ? 'cursor-pointer' : ''}
                ${isSelected ? 'ring-2 ring-[var(--vscode-focusBorder)]' : ''}
              `}
              draggable={!!localPaths?.[index]}
              onDragStart={() => handleDragStart(index)}
              onClick={() => {
                setSelectedIndex(index);
                handleOpen(index);
              }}
            >
              <img
                src={url}
                alt={`Result ${index + 1}`}
                className={`w-full aspect-square object-cover transition-opacity ${openOnClick ? 'group-hover:opacity-90' : ''}`}
                loading="lazy"
              />
              {/* Index badge */}
              <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[9px] text-white/80 tabular-nums">
                {index + 1}
              </div>
              {/* Hover overlay */}
              {openOnClick && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              )}
            </div>
          );
        })}
      </div>

      {/* Count label */}
      <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-1">
        {urls.length} images generated
      </div>
    </div>
  );
}

export const ImageGridCard = memo(ImageGridCardComponent);
