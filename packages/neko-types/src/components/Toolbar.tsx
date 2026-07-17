/**
 * Shared Vertical Toolbar Components
 *
 * Usage:
 *   import { VerticalToolbar, ToolbarButton, ToolbarSeparator, ToolbarSpacer } from '@neko/shared/components';
 *
 * CSS classes (.neko-vtoolbar, .neko-toolbar-btn, .neko-toolbar-sep) are injected
 * by the Tailwind preset plugin — no additional @import needed.
 */

import React from 'react';

// ── VerticalToolbar ──────────────────────────────────────────────────────────

export interface VerticalToolbarProps {
  /** Pixel width of the toolbar. Default: 48 */
  width?: number;
  children: React.ReactNode;
  className?: string;
}

export function VerticalToolbar({ width = 48, children, className }: VerticalToolbarProps) {
  return (
    <div className={`neko-vtoolbar${className ? ` ${className}` : ''}`} style={{ width }}>
      {children}
    </div>
  );
}

// ── ToolbarButton ────────────────────────────────────────────────────────────

export interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ToolbarButton({
  icon,
  title,
  active,
  disabled,
  onClick,
  className,
}: ToolbarButtonProps) {
  const cls = ['neko-toolbar-btn', active ? 'active' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={cls}
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}

// ── ToolbarSeparator ─────────────────────────────────────────────────────────

export function ToolbarSeparator() {
  return <div className="neko-toolbar-sep" />;
}

// ── ToolbarSpacer ────────────────────────────────────────────────────────────

export function ToolbarSpacer() {
  return <div style={{ flex: 1 }} />;
}
