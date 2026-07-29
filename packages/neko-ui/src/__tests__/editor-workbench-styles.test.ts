import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/workbench/editor-workbench.css', 'utf8');

describe('Workbench editor tab styles', () => {
  it('keeps labels bounded inside a horizontally scrollable editor strip', () => {
    const strip = styles.match(/\.neko-workbench-editor-tabs\s*\{(?<body>[\s\S]*?)\n\}/u);
    const tab = styles.match(/\.neko-workbench-editor-tab\s*\{(?<body>[\s\S]*?)\n\}/u);

    expect(strip?.groups?.body).toMatch(/overflow-x\s*:\s*auto/u);
    expect(tab?.groups?.body).toMatch(/min-width\s*:\s*\d+px/u);
    expect(tab?.groups?.body).toMatch(/max-width\s*:\s*\d+px/u);
    expect(styles).toMatch(
      /\.neko-workbench-editor-tab__label\s*\{[\s\S]*?text-overflow\s*:\s*ellipsis/u,
    );
  });

  it('uses a restrained active indicator and subordinate inactive tabs', () => {
    expect(styles).toMatch(
      /\.neko-workbench-editor-tab\[data-active='true'\]::after\s*\{[\s\S]*?height\s*:\s*2px/u,
    );
    expect(styles).toMatch(/\.neko-workbench-editor-tab:not\(\[data-active='true'\]\):hover\s*\{/u);
    expect(styles).toMatch(/\.neko-workbench-editor-tab:focus-visible\s*\{[\s\S]*?outline/u);
  });

  it('reveals close actions only for active, hovered, or keyboard-focused tabs', () => {
    expect(styles).toMatch(/\.neko-workbench-editor-tab__close\s*\{[\s\S]*?opacity\s*:\s*0/u);
    expect(styles).toMatch(
      /\.neko-workbench-editor-tab:is\([\s\S]*?\)\s+\.neko-workbench-editor-tab__close\s*\{[\s\S]*?opacity\s*:\s*1/u,
    );
  });
});
