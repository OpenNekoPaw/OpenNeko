/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8');
const root = readFileSync(resolve(import.meta.dirname, 'root.tsx'), 'utf8');

describe('Text Editor selection presentation', () => {
  it('uses the shared editor selection theme in Rich and Source surfaces', () => {
    const selectionRule = styles.match(/\.neko-text-editor-root ::selection\s*\{(?<body>[^}]*)\}/u);

    expect(selectionRule?.groups?.body).toContain('--neko-editor-selectionBackground');
    expect(selectionRule?.groups?.body).toContain('--neko-editor-selectionForeground');
    expect(root).toContain('--neko-editor-selectionBackground');
    expect(root).toContain('--neko-editor-selectionForeground');
    expect(root).not.toContain(
      "backgroundColor: 'var(--neko-list-activeSelectionBackground, #e8e8e7)'",
    );
  });
});
