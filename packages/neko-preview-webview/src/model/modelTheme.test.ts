import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('3D Reference theme projection', () => {
  it('consumes host VS Code tokens without overriding their values', () => {
    const css = readFileSync(resolve(__dirname, 'model.css'), 'utf8');
    expect(css).toContain('var(--vscode-editor-background)');
    expect(css).toContain('var(--vscode-sideBar-background');
    expect(css).toContain('var(--vscode-foreground)');
    expect(css).not.toMatch(/--vscode-[\w-]+\s*:/);
  });
});
