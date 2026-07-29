import type { KeyboardEvent, ReactNode } from 'react';
import {
  CameraIcon,
  CloseIcon,
  FileIcon,
  LayersIcon,
  PackageIcon,
  PlayIcon,
  ScissorsIcon,
  VolumeIcon,
} from '@neko/shared/icons';

export type ReferenceTokenKind =
  'file' | 'image' | 'video' | 'audio' | 'canvas' | 'clip' | 'entity';

export type ReferenceTokenVariant = 'ambient' | 'attached' | 'inline';

interface ReferenceTokenProps {
  kind: ReferenceTokenKind;
  label: string;
  variant?: ReferenceTokenVariant;
  title?: string;
  meta?: ReactNode;
  countLabel?: ReactNode;
  thumbnailSrc?: string | null;
  className?: string;
  ariaLabel?: string;
  removeLabel?: string;
  onClick?: () => void;
  onRemove?: () => void;
}

export function ReferenceToken({
  kind,
  label,
  variant = 'attached',
  title,
  meta,
  countLabel,
  thumbnailSrc,
  className,
  ariaLabel,
  removeLabel,
  onClick,
  onRemove,
}: ReferenceTokenProps) {
  const clickable = Boolean(onClick);
  const tokenTitle = title ?? label;

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <span
      className={[
        'agent-reference-token',
        `agent-reference-token-${variant}`,
        `agent-reference-token-${kind}`,
        clickable ? 'is-clickable' : '',
        onRemove ? 'is-removable' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-agent-reference-token="true"
      data-reference-kind={kind}
      data-reference-variant={variant}
      title={tokenTitle}
      aria-label={ariaLabel}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? handleKeyDown : undefined}
    >
      <ReferenceTokenIcon kind={kind} label={label} thumbnailSrc={thumbnailSrc} />
      <span className="agent-reference-label">{label}</span>
      {meta ? <span className="agent-reference-meta">{meta}</span> : null}
      {countLabel ? <span className="agent-reference-count">{countLabel}</span> : null}
      {onRemove ? (
        <button
          type="button"
          className="agent-reference-remove"
          aria-label={removeLabel ?? `Remove ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <CloseIcon size={12} strokeWidth={2} />
        </button>
      ) : null}
    </span>
  );
}

function ReferenceTokenIcon({
  kind,
  label,
  thumbnailSrc,
}: {
  kind: ReferenceTokenKind;
  label: string;
  thumbnailSrc?: string | null;
}) {
  if (thumbnailSrc && kind === 'image') {
    return <img src={thumbnailSrc} alt="" title={label} className="agent-reference-thumbnail" />;
  }

  const props = { size: 13, strokeWidth: 1.8 };
  return (
    <span className="agent-reference-icon" aria-hidden="true">
      {kind === 'canvas' ? <LayersIcon {...props} /> : null}
      {kind === 'clip' ? <ScissorsIcon {...props} /> : null}
      {kind === 'entity' ? <PackageIcon {...props} /> : null}
      {kind === 'image' ? <CameraIcon {...props} /> : null}
      {kind === 'video' ? <PlayIcon {...props} /> : null}
      {kind === 'audio' ? <VolumeIcon {...props} /> : null}
      {kind === 'file' ? <FileIcon {...props} /> : null}
    </span>
  );
}
