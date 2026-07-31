import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/primitives/popover.css', 'utf8');

describe('Popover compiled styles', () => {
  it('owns an opaque semantic surface without Tailwind source discovery', () => {
    expect(styles).toMatch(/\.neko-popover-surface\s*\{/u);
    expect(styles).toMatch(
      /background-color\s*:\s*var\(\s*--neko-popover-background,[\s\S]*?var\(--neko-editorWidget-background/u,
    );
    expect(styles).toMatch(/opacity\s*:\s*1/u);
    expect(styles).toMatch(/border\s*:\s*1px solid var\(--neko-popover-border/u);
    expect(styles).toMatch(/box-shadow\s*:\s*var\(--neko-popover-shadow/u);
    expect(styles).toMatch(/\.neko-popover-arrow\s*\{/u);
  });
});
