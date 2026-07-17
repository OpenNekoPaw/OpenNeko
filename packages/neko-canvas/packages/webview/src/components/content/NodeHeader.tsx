import type { ReactNode } from 'react';
import { ArrowRightIcon, ChevronDownIcon, ChevronRightIcon, ZoomInIcon } from '@neko/shared/icons';
import type { NodePresentation } from '../nodes/nodeTypeDescriptor';
import { t } from '../../i18n';

export interface NodeHeaderBadge {
  label: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface NodeHeaderProps {
  tagLabel: string;
  tagColor: string;
  title: string;
  badges?: NodeHeaderBadge[];
  collapsible: boolean;
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  onOpenPreview?: () => void;
  onExpand?: () => void;
  presentation?: NodePresentation;
  source?: 'file';
  icon?: ReactNode;
}

export function NodeHeader({
  tagLabel,
  tagColor,
  title,
  badges,
  collapsible,
  isCollapsed,
  onToggleCollapse,
  onOpenPreview,
  onExpand,
  presentation = 'structured',
  source,
  icon,
}: NodeHeaderProps) {
  const isFoundational = presentation === 'foundational';
  return (
    <div
      className={`node-header node-header--${presentation} flex items-center ${isFoundational ? 'gap-1.5 px-3 py-2' : 'gap-2 px-3 py-2'}`}
      data-node-header-presentation={presentation}
      data-node-header-source={source}
      tabIndex={-1}
    >
      {collapsible && (
        <button
          type="button"
          className="node-header-control flex-shrink-0"
          aria-label={isCollapsed ? t('node.expandContent') : t('node.collapseContent')}
          aria-expanded={!isCollapsed}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
        >
          {isCollapsed ? (
            <ChevronRightIcon size={12} strokeWidth={2} />
          ) : (
            <ChevronDownIcon size={12} strokeWidth={2} />
          )}
        </button>
      )}
      {icon && (
        <span className="node-header-icon" data-node-header-icon={source} aria-hidden="true">
          {icon}
        </span>
      )}
      {!isFoundational && (
        <span
          className="flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${tagColor}20`, color: tagColor }}
        >
          {tagLabel}
        </span>
      )}
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        style={{ color: 'var(--node-fg)' }}
        title={title}
      >
        {title}
      </span>
      {!isFoundational &&
        badges?.map((badge) => (
          <span
            key={badge.label}
            className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] leading-none ${getBadgeClassName(badge.tone)}`}
          >
            {badge.label}
          </span>
        ))}
      {onExpand && (
        <button
          type="button"
          className="node-header-control flex-shrink-0"
          aria-label={t('action.fullscreen')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
        >
          <ZoomInIcon size={13} strokeWidth={1.9} />
        </button>
      )}
      {onOpenPreview && (
        <button
          type="button"
          className="node-header-control flex-shrink-0"
          aria-label={t('action.openPreview')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPreview();
          }}
        >
          <ArrowRightIcon size={13} strokeWidth={1.9} />
        </button>
      )}
    </div>
  );
}

function getBadgeClassName(tone: NodeHeaderBadge['tone']): string {
  switch (tone) {
    case 'success':
      return 'bg-green-900/40 text-green-300';
    case 'warning':
      return 'bg-yellow-900/40 text-yellow-300';
    case 'danger':
      return 'bg-red-900/40 text-red-300';
    case 'info':
      return 'bg-blue-900/40 text-blue-300';
    default:
      return 'bg-black/30 text-[var(--node-fg-secondary)]';
  }
}
