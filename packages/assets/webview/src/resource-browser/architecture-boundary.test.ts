import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const resourceBrowserRoot = import.meta.dirname;

describe('Resource Browser architecture boundary', () => {
  it('keeps the browser entry free of VS Code, Electron and Node runtime imports', () => {
    const forbidden = ['vscode', 'electron', 'node:', 'fs', 'path'];
    const violations = walkTypeScript(resourceBrowserRoot).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return forbidden
        .filter((specifier) => containsModuleSpecifier(content, specifier))
        .map((specifier) => `${path.basename(file)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('separates the acquisition action from the two-state view control', () => {
    const styles = readFileSync(path.join(resourceBrowserRoot, 'style.css'), 'utf8');

    expect(styles).toMatch(
      /\.neko-resource-browser__search-field\s*\{[\s\S]*?border\s*:\s*1px solid/u,
    );
    expect(styles).not.toContain('.neko-resource-browser__search > div');
    expect(styles).toMatch(
      /\.neko-resource-browser__view-modes\s*\{[\s\S]*?gap\s*:\s*0;[\s\S]*?padding\s*:\s*1px;[\s\S]*?border\s*:\s*1px solid/u,
    );
    expect(styles).toMatch(
      /\.neko-resource-browser__view-modes button\[aria-pressed='true'\]\s*\{[\s\S]*?background\s*:\s*var\(--neko-elevated[\s\S]*?box-shadow/u,
    );
    expect(styles).toMatch(
      /\.neko-resource-browser__library-menu\s*>\s*\.neko-resource-browser__icon-button/u,
    );
  });
});

function walkTypeScript(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const file = path.join(directory, entry);
      return statSync(file).isDirectory() ? walkTypeScript(file) : [file];
    })
    .filter(
      (file) =>
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        !file.endsWith('architecture-boundary.test.ts'),
    );
}

function containsModuleSpecifier(content: string, specifier: string): boolean {
  return [
    `from '${specifier}`,
    `from "${specifier}`,
    `import '${specifier}`,
    `import "${specifier}`,
  ].some((token) => content.includes(token));
}
