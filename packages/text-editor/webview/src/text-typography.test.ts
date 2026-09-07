/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8');
const root = readFileSync(resolve(import.meta.dirname, 'root.tsx'), 'utf8');

describe('Text Editor typography', () => {
  it('uses editor-scoped CJK-aware sans and monospace stacks', () => {
    const rootRule = styles.match(/\.neko-text-editor-root\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(rootRule?.groups?.body).toContain('--neko-text-editor-sans');
    expect(rootRule?.groups?.body).toContain('PingFang SC');
    expect(rootRule?.groups?.body).toContain('Noto Sans CJK SC');
    expect(rootRule?.groups?.body).toContain('--neko-text-editor-mono');
    expect(styles).toContain('font-family: var(--neko-text-editor-mono)');
    expect(root).toContain("fontFamily: 'var(--neko-text-editor-mono)'");
  });

  it('keeps headings and emphasis distinct without synthetic-heavy weights', () => {
    expect(styles).toMatch(
      /\.neko-text-editor-milkdown-mount h1,[\s\S]*?font-weight: 650;[\s\S]*?text-wrap: balance;/u,
    );
    expect(styles).toMatch(/\.neko-text-editor-milkdown-mount strong\s*\{[^}]*font-weight: 650;/u);
  });

  it('uses a compact vertical rhythm without stacking paragraph margins in list items', () => {
    expect(styles).toMatch(
      /\.neko-text-editor-milkdown-mount \.ProseMirror\s*\{[\s\S]*?line-height: 1\.72;/u,
    );
    expect(styles).toMatch(
      /\.neko-text-editor-milkdown-mount li \+ li\s*\{[^}]*margin-top: 0\.46em;/u,
    );
    expect(styles).toMatch(
      /\.neko-text-editor-milkdown-mount li > p:only-child\s*\{[^}]*margin: 0;/u,
    );
    expect(styles).toMatch(
      /\.neko-text-editor-milkdown-mount li\[data-item-type='task'\]::before\s*\{[\s\S]*?top: 0\.41em;/u,
    );
  });
});
