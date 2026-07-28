import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { describe, expect, it } from 'vitest';
import { desktopFuseConfig } from '../fuse.config.js';

const sourceRoot = path.resolve(import.meta.dirname);

describe('Desktop architecture boundaries', () => {
  it('uses explicit CommonJS extensions for Electron main and preload bundles', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(sourceRoot, '..', 'package.json'), 'utf8'),
    ) as { readonly main?: unknown };
    const mainConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'vite.main.config.ts'),
      'utf8',
    );
    const preloadConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'vite.preload.config.ts'),
      'utf8',
    );
    const main = readFileSync(path.join(sourceRoot, 'main', 'index.ts'), 'utf8');

    expect(packageJson.main).toBe('.vite/build/main.cjs');
    expect(mainConfig).toContain("entryFileNames: 'main.cjs'");
    expect(preloadConfig).toContain("entryFileNames: 'preload.cjs'");
    expect(main).toContain("path.join(__dirname, 'preload.cjs')");
  });

  it('pins the Electron archive checksum for the Phase 1 reference target', () => {
    const forgeConfig = readFileSync(
      path.resolve(sourceRoot, '..', 'forge.config.ts'),
      'utf8',
    );

    expect(forgeConfig).toContain('electron-v43.2.0-darwin-arm64.zip');
    expect(forgeConfig).toContain(
      'ad4a0ae3c37ee05aa06c7e2ed0627608389790f0505a2b0d20319efbe33ffe28',
    );
  });

  it('strictly configures every Electron V1 fuse', () => {
    expect(desktopFuseConfig).toEqual({
      version: FuseVersion.V1,
      strictlyRequireAllFuses: true,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
      [FuseV1Options.WasmTrapHandlers]: true,
    });
  });

  it('keeps React and DOM imports out of main', () => {
    const violations = findForbiddenImports(path.join(sourceRoot, 'main'), [
      'react',
      'react-dom',
    ]);
    expect(violations).toEqual([]);
  });

  it('keeps Node, Electron and VS Code imports out of renderer', () => {
    const violations = findForbiddenImports(path.join(sourceRoot, 'renderer'), [
      'node:',
      'electron',
      'vscode',
    ]);
    expect(violations).toEqual([]);
  });

  it('does not expose raw IPC or an arbitrary command bridge', () => {
    const preload = readFileSync(path.join(sourceRoot, 'preload', 'index.ts'), 'utf8');
    expect(preload).not.toContain('ipcRenderer.send');
    expect(preload).not.toContain('executeCommand');
    expect(preload).not.toContain('channel: string');
  });
});

function findForbiddenImports(directory: string, forbidden: readonly string[]): string[] {
  const violations: string[] = [];
  for (const file of walkTypeScript(directory)) {
    const content = readFileSync(file, 'utf8');
    for (const specifier of forbidden) {
      if (containsModuleSpecifier(content, specifier)) {
        violations.push(`${path.relative(sourceRoot, file)} -> ${specifier}`);
      }
    }
  }
  return violations;
}

function walkTypeScript(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const file = path.join(directory, entry);
      return statSync(file).isDirectory() ? walkTypeScript(file) : [file];
    })
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));
}

function containsModuleSpecifier(content: string, specifier: string): boolean {
  return [
    `from '${specifier}`,
    `from "${specifier}`,
    `import '${specifier}`,
    `import "${specifier}`,
    `export '${specifier}`,
    `export "${specifier}`,
  ].some((token) => content.includes(token));
}
