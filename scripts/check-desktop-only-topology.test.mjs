import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectDesktopOnlyTopology } from './check-desktop-only-topology.mjs';

describe('desktop-only topology guard', () => {
  it('accepts one Desktop app and canonical grouped host-neutral packages', () => {
    assert.deepEqual(
      inspectDesktopOnlyTopology({
        appPackagePaths: ['apps/neko-desktop/package.json'],
        nestedPackagePaths: [],
        packageEntries: [
          {
            path: 'packages/ui/package.json',
            manifest: { dependencies: { '@vscode/codicons': '0.0.45' } },
          },
        ],
        pnpmWorkspacePatterns: ['apps/*', 'packages/*', 'packages/*/*'],
        productionSourceEntries: [
          {
            path: 'packages/agent/webview/src/dsh-session/root.tsx',
            content: "import { createRoot } from 'react-dom/client';",
          },
        ],
        rootPackageJson: {
          scripts: {
            build: 'pnpm --recursive --if-present --sort run build',
            'package:desktop': 'pnpm --filter @neko/app-desktop package',
          },
          workspaces: ['apps/*', 'packages/*', 'packages/*/*'],
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
      nestedPackagePaths: ['packages/agent/packages/webview/package.json'],
      packageEntries: [
        {
          path: 'packages/preview/webview/package.json',
          manifest: { devDependencies: { '@types/vscode': '^1.99.0' } },
        },
      ],
      pnpmWorkspacePatterns: ['apps/*', 'packages/*/packages/*'],
      productionSourceEntries: [
        {
          path: 'packages/chara/domain/src/host-vscode/index.ts',
          content: "import * as vscode from 'vscode';",
        },
        {
          path: 'packages/agent/webview/src/bridge.ts',
          content: "const host = acquireVsCodeApi(); const uri = 'vscode-webview://legacy';",
        },
      ],
      rootPackageJson: {
        scripts: {
          'package:vscode': 'vsce package',
          nekoagent: 'pnpm --filter @neko/app-tui dev',
        },
        workspaces: ['apps/*', 'packages/*', 'packages/*/packages/*'],
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
    assert.ok(violations.some((violation) => violation.includes('VS Code runtime URI')));
    assert.ok(violations.some((violation) => violation.includes('package:vscode')));
    assert.ok(violations.some((violation) => violation.includes('@vscode/vsce')));
    assert.ok(violations.some((violation) => violation.includes('@types/vscode')));
    assert.ok(violations.some((violation) => violation.includes('package.json#workspaces')));
    assert.ok(violations.some((violation) => violation.includes('pnpm-workspace.yaml#packages')));
  });
});
