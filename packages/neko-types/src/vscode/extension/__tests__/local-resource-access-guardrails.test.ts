import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../../../..');

const migratedExtensionFiles = [
  'packages/neko-agent/packages/extension/src',
  'packages/neko-canvas/packages/extension/src',
  'packages/neko-cut/packages/extension/src',
  'packages/neko-tools/packages/extension/src',
  'packages/neko-preview/packages/extension/src',
] as const;

const allowedLocalResourceRootFiles = new Set([
  'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
  'packages/neko-tools/packages/extension/src/asset-diff/editor/AssetVariantDiffEditorProvider.ts',
  'packages/neko-agent/packages/extension/src/services/localResourceAccess.ts',
]);

describe('local resource access guardrails', () => {
  it('keeps migrated packages from directly projecting local file media', () => {
    const offenders = scanFiles((source) =>
      /asWebviewUri\s*\(\s*(?:vscode\.)?Uri\.file\s*\(/.test(source),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps migrated packages from assembling Webview roots outside approved helpers', () => {
    const offenders = scanFiles((source, relativePath) => {
      if (allowedLocalResourceRootFiles.has(relativePath)) return false;
      return /localResourceRoots\s*:\s*\[|const\s+localResourceRoots\s*=|localResourceRoots\.push/.test(
        source,
      );
    });

    expect(offenders).toEqual([]);
  });

  it('keeps local resource access out of search and entity semantic stores', () => {
    const source = readFileSync(
      path.join(repoRoot, 'packages/neko-types/src/vscode/extension/local-resource-access.ts'),
      'utf-8',
    );

    expect(source).not.toMatch(
      /neko-search|projectSearch|entity facts|binding files|metadata store/i,
    );
  });
});

function scanFiles(predicate: (source: string, relativePath: string) => boolean): string[] {
  const files = listTypeScriptFiles();
  const offenders: string[] = [];

  for (const file of files) {
    const source = readFileSync(path.join(repoRoot, file), 'utf-8');
    if (predicate(source, file)) offenders.push(file);
  }

  return offenders;
}

function listTypeScriptFiles(): string[] {
  const files: string[] = [];
  for (const directory of migratedExtensionFiles) {
    collectTypeScriptFiles(directory, files);
  }

  return files
    .filter(
      (file) => file.endsWith('.ts') && !file.includes('/__tests__/') && !file.endsWith('.test.ts'),
    )
    .sort();
}

function collectTypeScriptFiles(relativeDirectory: string, files: string[]): void {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = normalizePath(path.join(relativeDirectory, entry.name));
    if (entry.isDirectory()) {
      collectTypeScriptFiles(relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
