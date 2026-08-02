import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findSharedComponentsImportViolations,
  type SharedComponentsImportAllowance,
} from '../test-utils/source-guards';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
const packagesRoot = join(repoRoot, 'packages');
const sourceExtensions = new Set(['.ts', '.tsx']);
const skippedDirectories = new Set(['.turbo', 'build', 'dist', 'node_modules']);
const sharedComponentsSpecifier = '@neko/shared/components';

const legacySharedComponentsAllowlist: readonly SharedComponentsImportAllowance[] = [];

describe('legacy @neko/shared/components import cutoff', () => {
  it('keeps the removed Shared components entry unreferenced', () => {
    const sources = new Map(
      collectScanRoots().flatMap((root) =>
        collectSourceFiles(root).flatMap((filePath) => {
          const source = readFileSync(filePath, 'utf-8');

          if (!source.includes(sharedComponentsSpecifier)) {
            return [];
          }

          return [
            [relative(repoRoot, filePath).replace(/\\/g, '/'), source] satisfies readonly [
              string,
              string,
            ],
          ];
        }),
      ),
    );

    expect(findSharedComponentsImportViolations(sources, legacySharedComponentsAllowlist)).toEqual(
      [],
    );
  });
});

function collectScanRoots(): string[] {
  const packageSourceRoots = readdirSync(packagesRoot).flatMap((entry) => {
    const packageSrc = join(packagesRoot, entry, 'src');

    if (!existsSync(packageSrc)) {
      return [];
    }

    return [packageSrc];
  });

  return packageSourceRoots;
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (skippedDirectories.has(entry)) {
        return [];
      }

      return collectSourceFiles(path);
    }

    if (!Array.from(sourceExtensions).some((extension) => path.endsWith(extension))) {
      return [];
    }

    return [path];
  });
}
