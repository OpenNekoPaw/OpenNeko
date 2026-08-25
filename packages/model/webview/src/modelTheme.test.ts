import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('3D Reference theme projection', () => {
  it('consumes the Desktop theme contract without overriding host-owned values', () => {
    const css = readFileSync(new URL('./model.css', import.meta.url), 'utf8');
    expect(css).toContain('var(--neko-editor-background)');
    expect(css).toContain('var(--neko-sideBar-background');
    expect(css).toContain('var(--neko-foreground)');
    expect(css).not.toMatch(/--neko-(?:editor-background|sideBar-background|foreground)\s*:/);
    expect(css).not.toMatch(/(^|\n)\s*#root\s*[,{]/u);
    expect(css).not.toMatch(/(^|\n)\s*html\s*,/u);
  });
});
