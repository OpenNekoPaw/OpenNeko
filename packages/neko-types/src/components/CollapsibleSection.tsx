/**
 * CollapsibleSection — Unified collapsible panel section.
 *
 * Merges neko-sketch CollapsiblePanel + neko-cut PropertyGroup patterns.
 * Caller is responsible for i18n — pass already-translated `title` string.
 *
 * CSS classes injected by Tailwind preset plugin.
 */

import React, { useState } from 'react';

export interface CollapsibleSectionProps {
  /** Already-translated section title shown in header */
  title: string;
  defaultExpanded?: boolean;
  /**
   * When true, the section collapses and the header becomes non-interactive.
   * Used by neko-cut's PropertyGroup to disable unavailable property groups.
   */
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

const ChevronIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
    <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06z" />
  </svg>
);

export function CollapsibleSection({
  title,
  defaultExpanded = true,
  disabled = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded && !disabled);

  const isExpanded = expanded && !disabled;

  const handleToggle = () => {
    if (!disabled) setExpanded((prev) => !prev);
  };

  return (
    <div className={`neko-collapsible${className ? ` ${className}` : ''}`}>
      <button
        className="neko-collapsible-header"
        onClick={handleToggle}
        disabled={disabled}
        aria-expanded={isExpanded}
        style={disabled ? { pointerEvents: 'none', opacity: 0.4 } : undefined}
      >
        <span className={`neko-collapsible-chevron${isExpanded ? ' expanded' : ''}`}>
          <ChevronIcon />
        </span>
        {title}
      </button>
      {isExpanded && <div className="neko-collapsible-body">{children}</div>}
    </div>
  );
}
