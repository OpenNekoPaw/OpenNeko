import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = import.meta.dirname;

describe('Character Webview architecture boundary', () => {
  it('keeps the browser product surface on injected public contracts', () => {
    const forbidden = ['electron', 'node:', '@neko/agent-runtime', '@neko/world/application'];
    const violations = walkTypeScript(sourceRoot).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return forbidden
        .filter((specifier) => containsModuleSpecifier(content, specifier))
        .map((specifier) => `${path.basename(file)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
    expect(readFileSync(path.join(sourceRoot, 'root.tsx'), 'utf8')).not.toContain(
      'window.openNekoDesktop',
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
