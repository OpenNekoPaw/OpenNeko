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

const legacySharedComponentsAllowlist: readonly SharedComponentsImportAllowance[] = [
  {
    filePath: 'packages/neko-agent/packages/webview/src/components/ChatView/DropZone.tsx',
    importNames: ['FileDropResult', 'useFileDrop'],
  },
  {
    filePath: 'packages/neko-ui/src/hooks/hooks-compat.test.ts',
    importNames: ['*'],
  },
  {
    filePath: 'packages/neko-ui/src/hooks/index.ts',
    importNames: [
      'DragBindings',
      'DragCallbacks',
      'DragOptions',
      'FileDropBindings',
      'FileDropOptions',
      'FileDropResult',
      'FileDropResultType',
      'PersistedResizeOptions',
      'PersistedResizeReturn',
      'ResizeBounds',
      'ResizeEdge',
      'ResizeHandleBindings',
      'ResizeMode',
      'ResizeOrientation',
      'ResizePointerPosition',
      'ResizeRect',
      'ResizeState',
      'UseResizableControlledOptions',
      'UseResizableOptions',
      'UseResizableReturn',
      'UseResizableUncontrolledOptions',
      'normalizeResizeState',
      'readPersistedResizeState',
      'useDrag',
      'useFileDrop',
      'usePersistedResize',
      'useResizable',
      'writePersistedResizeState',
    ],
  },
  {
    filePath: 'packages/neko-ui/src/primitives/resize-handle.ts',
    importNames: ['ResizeHandle', 'ResizeHandleProps'],
  },
];

describe('legacy @neko/shared/components import cutoff', () => {
  it('keeps remaining legacy imports explicitly exempted after Phase 3.3', () => {
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
  const webviewSourceRoots = readdirSync(packagesRoot).flatMap((entry) => {
    const webviewSrc = join(packagesRoot, entry, 'packages', 'webview', 'src');

    if (!existsSync(webviewSrc)) {
      return [];
    }

    return [webviewSrc];
  });

  return [...webviewSourceRoots, join(packagesRoot, 'neko-ui', 'src')];
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
