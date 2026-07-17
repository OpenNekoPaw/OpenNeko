import type React from 'react';
import type { IconProps } from '@neko/ui/icons';

const base = (strokeWidth: number) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

function SvgIcon({
  size = 14,
  className,
  strokeWidth = 2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      {...base(strokeWidth)}
    >
      {children}
    </svg>
  );
}

export const StoryboardNodeIcon = (
  <SvgIcon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5 4 9" />
    <path d="M13 5 10 9" />
    <path d="M19 5 16 9" />
    <line x1="3" y1="9" x2="21" y2="9" />
  </SvgIcon>
);

export const ShotNodeIcon = (
  <SvgIcon>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M8 5 5 9" />
    <path d="M14 5 11 9" />
    <line x1="4" y1="9" x2="20" y2="9" />
    <circle cx="12" cy="14" r="2.5" />
  </SvgIcon>
);

export const SceneNodeIcon = (
  <SvgIcon>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <line x1="8" y1="4" x2="8" y2="20" />
    <line x1="16" y1="4" x2="16" y2="20" />
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
  </SvgIcon>
);

export const ArtboardNodeIcon = (
  <SvgIcon>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M7 17 11 13 14 16 16 14 19 17" />
  </SvgIcon>
);

export const GalleryNodeIcon = (
  <SvgIcon>
    <rect x="3" y="6" width="14" height="12" rx="2" />
    <path d="M7 6V4h12a2 2 0 0 1 2 2v10h-4" />
    <circle cx="8" cy="11" r="1.5" />
    <path d="M5 16 9 13 12 15 15 12" />
  </SvgIcon>
);

export const TableNodeIcon = (
  <SvgIcon>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <line x1="4" y1="10" x2="20" y2="10" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="5" x2="10" y2="19" />
    <line x1="15" y1="5" x2="15" y2="19" />
  </SvgIcon>
);

export const ScriptNodeIcon = (
  <SvgIcon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <polyline points="14,3 14,8 19,8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </SvgIcon>
);

export const DocumentNodeIcon = (
  <SvgIcon>
    <path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z" />
    <path d="M6 4v14a2 2 0 0 0 2 2" />
    <line x1="9" y1="8" x2="16" y2="8" />
    <line x1="9" y1="12" x2="15" y2="12" />
  </SvgIcon>
);

export const ModelNodeIcon = (
  <SvgIcon>
    <path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" />
    <path d="M12 12 4 7.5" />
    <path d="M12 12v9" />
    <path d="M12 12l8-4.5" />
  </SvgIcon>
);

export const CanvasEmbedNodeIcon = (
  <SvgIcon>
    <rect x="4" y="5" width="16" height="12" rx="2" />
    <path d="M8 19h8" />
    <path d="M10 17v2" />
    <path d="M14 17v2" />
    <rect x="8" y="8" width="8" height="6" rx="1" />
  </SvgIcon>
);

export const ProjectNodeIcon = (
  <SvgIcon>
    <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M4 7V5a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v2" />
    <path d="M9 14h6" />
  </SvgIcon>
);
