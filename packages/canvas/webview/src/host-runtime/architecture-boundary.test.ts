import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const hostRuntimeRoot = import.meta.dirname;

describe('Canvas Host runtime architecture boundary', () => {
  it('keeps the browser runtime contract free of Electron and Node imports', () => {
    const violations = walkTypeScript(hostRuntimeRoot).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return ['electron', 'node:', 'fs', 'path']
        .filter((specifier) => containsModuleSpecifier(content, specifier))
        .map((specifier) => `${path.basename(file)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('requires the public Canvas Root to receive its host runtime explicitly', () => {
    const root = readFileSync(path.resolve(hostRuntimeRoot, '..', 'root.tsx'), 'utf8');
    const app = readFileSync(path.resolve(hostRuntimeRoot, '..', 'CanvasApp.tsx'), 'utf8');

    expect(root).toContain('runtime: CanvasHostRuntime');
    expect(root).toContain('<CanvasHostProvider host={host}>');
    expect(root).toContain('<CanvasApp host={host}');
    expect(root).not.toContain('getGlobalHostApi');
    expect(app).not.toContain('getGlobalHostApi');

    const webviewRoot = path.resolve(hostRuntimeRoot, '..');
    const implicitGlobalViolations = walkTypeScript(webviewRoot)
      .filter(
        (file) =>
          !file.endsWith('.test.ts') &&
          !file.endsWith('.test.tsx') &&
          !file.endsWith(`${path.sep}main.tsx`),
      )
      .flatMap((file) => {
        const content = readFileSync(file, 'utf8');
        return ['getGlobalHostApi', 'getCanvasHostMessagePort']
          .filter((token) => content.includes(token))
          .map((token) => `${path.relative(webviewRoot, file)} -> ${token}`);
      });
    expect(implicitGlobalViolations).toEqual([]);
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
