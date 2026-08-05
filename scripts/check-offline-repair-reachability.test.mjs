import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findOfflineRepairReachabilityViolations } from './check-offline-repair-reachability.mjs';

describe('offline repair reachability audit', () => {
  it('allows an isolated explicit tool under the tools root', () => {
    const findings = findOfflineRepairReachabilityViolations([
      {
        path: 'tools/offline-repair/fix-one-record.mjs',
        content: 'export async function runExplicitRepair() {}',
      },
      { path: 'packages/example/src/index.ts', content: 'export const stable = true;' },
    ]);

    assert.deepEqual(findings, []);
  });

  it('rejects product imports, public exports, build output, normal tests, and CI commands', () => {
    const findings = findOfflineRepairReachabilityViolations([
      {
        path: 'tools/offline-repair/fix-one-record.mjs',
        content: 'export async function runExplicitRepair() {}',
      },
      {
        path: 'apps/neko-desktop/src/main/index.ts',
        content: "import '../../../../tools/offline-repair/fix-one-record.mjs';",
      },
      {
        path: 'packages/example/package.json',
        content: '{"exports":{"./repair":"../../tools/offline-repair/fix-one-record.mjs"}}',
      },
      {
        path: 'packages/example/src/runtime.test.ts',
        content: "import '../../../tools/offline-repair/fix-one-record.mjs';",
      },
      {
        path: '.github/workflows/ci.yml',
        content: 'run: node tools/offline-repair/fix-one-record.mjs',
      },
      {
        path: 'apps/neko-desktop/.vite/build/main.js',
        content: 'const bundledSource = "tools/offline-repair/fix-one-record.mjs";',
      },
    ]);

    assert.deepEqual(
      new Set(findings.map((finding) => finding.path)),
      new Set([
        '.github/workflows/ci.yml',
        'apps/neko-desktop/.vite/build/main.js',
        'apps/neko-desktop/src/main/index.ts',
        'packages/example/package.json',
        'packages/example/src/runtime.test.ts',
      ]),
    );
  });

  it('rejects repair modules placed inside product packages', () => {
    assert.deepEqual(
      findOfflineRepairReachabilityViolations([
        {
          path: 'packages/example/src/offline-repair/fix-one-record.ts',
          content: 'export const repair = true;',
        },
      ]),
      [
        {
          path: 'packages/example/src/offline-repair/fix-one-record.ts',
          reason: 'repair-module-outside-tools-root',
        },
      ],
    );
  });
});
