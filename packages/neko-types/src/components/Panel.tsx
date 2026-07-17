/**
 * Panel + PanelSection — Shared side panel shell components.
 *
 * Panel:        Full side panel with optional title header and scrollable body.
 * PanelSection: Non-collapsible labeled section within a panel.
 *               Used by neko-canvas PropertyPanel for fixed property groups.
 *
 * CSS classes injected by Tailwind preset plugin.
 */

import React from 'react';

// ── Panel ────────────────────────────────────────────────────────────────────

export interface PanelProps {
  title?: string;
  width?: number;
  /** Which side to draw the 1px border. Default: 'left' */
  border?: 'left' | 'right' | 'none';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Panel({ title, width, border = 'left', children, className, style }: PanelProps) {
  const borderStyle: React.CSSProperties =
    border === 'left'
      ? { borderLeft: '1px solid var(--neko-border)' }
      : border === 'right'
        ? { borderRight: '1px solid var(--neko-border)' }
        : {};

  return (
    <div
      className={`neko-panel${className ? ` ${className}` : ''}`}
      style={{ width, ...borderStyle, ...style }}
    >
      {title !== undefined && <div className="neko-panel-header">{title}</div>}
      <div className="neko-panel-body">{children}</div>
    </div>
  );
}

// ── PanelSection ─────────────────────────────────────────────────────────────

export interface PanelSectionProps {
  /** Small label shown above content (automatically uppercased via CSS) */
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function PanelSection({ title, children, className }: PanelSectionProps) {
  return (
    <div className={`neko-panel-section${className ? ` ${className}` : ''}`}>
      <div className="neko-panel-section-title">{title}</div>
      {children}
    </div>
  );
}
