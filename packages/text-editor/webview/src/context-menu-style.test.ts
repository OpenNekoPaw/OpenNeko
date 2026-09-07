/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8');

describe('Text Editor context menu presentation', () => {
  it('uses Desktop overlay, interaction, and typography tokens', () => {
    const menuRule = styles.match(/\.neko-text-editor-edit-menu\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(menuRule?.groups?.body).toContain('--neko-desktop-border');
    expect(menuRule?.groups?.body).toContain('--neko-desktop-control-hover');
    expect(menuRule?.groups?.body).toContain('--neko-desktop-shadow-overlay');
    expect(menuRule?.groups?.body).toContain('--glass-blur');
    expect(menuRule?.groups?.body).toContain('--neko-font-family');
    expect(menuRule?.groups?.body).toContain('PingFang SC');
    expect(styles).toContain('.neko-text-editor-edit-menu .neko-menu-item');
    expect(styles).toContain('font-family: inherit');
    expect(styles).toContain('.neko-text-editor-edit-menu .neko-menu-item-icon');
    expect(styles).toContain('.neko-text-editor-edit-menu .neko-menu-item-shortcut');
  });
});
