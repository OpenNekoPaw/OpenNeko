import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('3D Reference theme projection', () => {
  it('consumes host VS Code tokens without overriding their values', () => {
    const css = readFileSync(new URL('./model.css', import.meta.url), 'utf8');
    expect(css).toContain('var(--vscode-editor-background)');
    expect(css).toContain('var(--vscode-sideBar-background');
    expect(css).toContain('var(--vscode-foreground)');
    expect(css).not.toMatch(/--vscode-[\w-]+\s*:/);
  });
});
