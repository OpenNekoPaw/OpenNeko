import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectDesktopOnlyTopology } from './check-desktop-only-topology.mjs';

describe('desktop-only topology guard', () => {
  it('accepts one Desktop app and first-level host-neutral packages', () => {
    assert.deepEqual(
      inspectDesktopOnlyTopology({
        appPackagePaths: ['apps/neko-desktop/package.json'],
        nestedPackagePaths: [],
        productionSourceEntries: [
          {
            path: 'packages/neko-agent-webview/src/root.tsx',
            content: "import { createRoot } from 'react-dom/client';",
          },
        ],
        rootPackageJson: {
          scripts: {
            build: 'turbo run build',
            'package:desktop': 'pnpm --filter @neko/app-desktop package',
          },
          devDependencies: {
            electron: '43.2.0',
          },
        },
      }),
      [],
    );
  });

  it('rejects removed hosts, nested packages and compatibility APIs', () => {
    const violations = inspectDesktopOnlyTopology({
      appPackagePaths: [
        'apps/neko-desktop/package.json',
        'apps/neko-tui/package.json',
        'apps/neko-vscode/package.json',
      ],
      nestedPackagePaths: ['packages/neko-agent-webview/package.json'],
      productionSourceEntries: [
        {
          path: 'packages/neko-chara/src/host-vscode/index.ts',
          content: "import * as vscode from 'vscode';",
        },
        {
          path: 'packages/neko-agent-webview/src/bridge.ts',
          content: 'const host = acquireVsCodeApi();',
        },
      ],
      rootPackageJson: {
        scripts: {
          'package:vscode': 'vsce package',
          nekoagent: 'pnpm --filter @neko/app-tui dev',
        },
        devDependencies: {
          '@vscode/vsce': '^3.9.2',
        },
      },
    });

    assert.ok(violations.some((violation) => violation.includes('Expected only')));
    assert.ok(violations.some((violation) => violation.includes('Nested workspace package')));
    assert.ok(violations.some((violation) => violation.includes('VS Code host adapter')));
    assert.ok(violations.some((violation) => violation.includes('vscode import')));
    assert.ok(violations.some((violation) => violation.includes('VS Code Webview API')));
    assert.ok(violations.some((violation) => violation.includes('package:vscode')));
    assert.ok(violations.some((violation) => violation.includes('@vscode/vsce')));
  });
});
