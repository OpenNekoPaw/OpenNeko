import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const hostRuntimeRoot = import.meta.dirname;

describe('Canvas Host runtime architecture boundary', () => {
  it('keeps the browser runtime contract free of VS Code, Electron and Node imports', () => {
    const violations = walkTypeScript(hostRuntimeRoot).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return ['vscode', 'electron', 'node:', 'fs', 'path']
        .filter((specifier) => containsModuleSpecifier(content, specifier))
        .map((specifier) => `${path.basename(file)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('does not let the public Canvas Root acquire a global VS Code API', () => {
    const root = readFileSync(path.resolve(hostRuntimeRoot, '..', 'root.tsx'), 'utf8');
    const app = readFileSync(path.resolve(hostRuntimeRoot, '..', 'CanvasApp.tsx'), 'utf8');

    expect(root).toContain('runtime: CanvasHostRuntime');
    expect(root).toContain('<CanvasHostProvider host={host}>');
    expect(root).toContain('<CanvasApp host={host}');
    expect(root).not.toContain('getGlobalVSCodeApi');
    expect(root).not.toContain('acquireVsCodeApi');
    expect(app).not.toContain('getGlobalVSCodeApi');
    expect(app).not.toContain('const vscode: VSCodeAPI');

    const webviewRoot = path.resolve(hostRuntimeRoot, '..');
    const legacyGlobalViolations = walkTypeScript(webviewRoot)
      .filter(
        (file) =>
          !file.endsWith('.test.ts') &&
          !file.endsWith('.test.tsx') &&
          !file.endsWith(`${path.sep}main.tsx`) &&
          !file.endsWith(`${path.sep}vscode-canvas-host-runtime.ts`),
      )
      .flatMap((file) => {
        const content = readFileSync(file, 'utf8');
        return ['getGlobalVSCodeApi', 'getVSCodeAPI', 'acquireVsCodeApi']
          .filter((token) => content.includes(token))
          .map((token) => `${path.relative(webviewRoot, file)} -> ${token}`);
      });
    expect(legacyGlobalViolations).toEqual([]);
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
