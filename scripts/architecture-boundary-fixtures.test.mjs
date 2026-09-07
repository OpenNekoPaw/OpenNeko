import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { checkApplicationBoundaries } from './check-application-boundaries.mjs';
import {
  inspectNonCanonicalPackageNaming,
  inspectPackageBoundaries,
} from './check-package-boundaries.mjs';
import { validatePackageRoleCatalog } from './check-package-roles.mjs';

const require = createRequire(import.meta.url);
const dependencyConfig = require('../.dependency-cruiser.cjs');

describe('architecture boundary failing fixtures', () => {
  it('rejects undeclared/private imports and extra application roots in a real workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-package-check-'));
    try {
      const sources = {
        'quality/package-roles.json': JSON.stringify({
          packages: [{ path: 'packages/example' }],
        }),
        'packages/example/package.json': JSON.stringify({
          name: '@neko/example',
          exports: { '.': './src/index.ts' },
        }),
        'packages/example/src/index.ts': 'export const value = 1;',
        'apps/neko-desktop/package.json': JSON.stringify({ name: '@neko/app-desktop' }),
        'apps/neko-desktop/src/index.ts': "import '@neko/example/private';",
        'apps/extra/package.json': JSON.stringify({ name: '@neko/app-extra' }),
      };
      for (const [file, source] of Object.entries(sources)) {
        await mkdir(dirname(join(root, file)), { recursive: true });
        await writeFile(join(root, file), source);
      }
      const result = await inspectPackageBoundaries(root);
      assert.equal(result.status, 'failed');
      assert.deepEqual(result.findings.map((finding) => finding.rule).sort(), [
        'application-root',
        'undeclared-workspace-dependency',
        'unexported-package-import',
      ]);
      await rm(join(root, 'apps/extra'), { recursive: true });
      await writeFile(
        join(root, 'apps/neko-desktop/package.json'),
        JSON.stringify({
          name: '@neko/app-desktop',
          dependencies: { '@neko/example': 'workspace:*' },
        }),
      );
      await writeFile(join(root, 'apps/neko-desktop/src/index.ts'), "import '@neko/example';");
      assert.equal((await inspectPackageBoundaries(root)).status, 'passed');
      await writeFile(join(root, 'apps/neko-desktop/package.json'), '{broken');
      await assert.rejects(inspectPackageBoundaries(root), SyntaxError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects package-to-app, Webview-to-Node/Electron, and Main-to-React imports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-boundary-check-'));
    try {
      const sources = {
        'quality/package-roles.json': JSON.stringify({
          packages: [
            { path: 'packages/example/domain', roles: ['domain'], runtimes: ['host-neutral'] },
            { path: 'packages/example/webview', roles: ['webview'], runtimes: ['browser'] },
            {
              name: '@neko/example-node',
              path: 'packages/example/node',
              roles: ['node'],
              runtimes: ['node'],
            },
          ],
        }),
        'packages/example/webview/src/root.ts': [
          "const fs = require('fs'); import('node:fs/promises');",
          'import(`@neko/example-node`);',
          "import child = require('node:child_process');",
        ].join('\n'),
        'apps/neko-desktop/src/main/main.ts': "import React from 'react';",
        'apps/neko-desktop/src/main/shell.ts': "export const shell = 'desktop';",
        'apps/neko-desktop/src/renderer/renderer.ts':
          "import { readFile } from 'node:fs/promises';",
        'packages/example/domain/src/domain.ts': [
          "import { ipcRenderer } from 'electron';",
          "import { shell } from '../../../../apps/neko-desktop/src/main/shell';",
        ].join('\n'),
      };
      await Promise.all(
        Object.entries(sources).map(async ([file, source]) => {
          const target = join(root, file);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, source);
        }),
      );
      const result = await checkApplicationBoundaries(root);
      assert.ok(result.findings.some((finding) => finding.includes('packages must not import')));
      assert.ok(result.findings.some((finding) => finding.includes('must not import Electron')));
      assert.ok(
        result.findings.some((finding) => finding.includes('renderer must remain browser-safe')),
      );
      assert.ok(
        result.findings.some((finding) => finding.includes('Host code must not depend on React')),
      );
      assert.ok(
        result.findings.some(
          (finding) =>
            finding.includes('packages/example/webview/src/root.ts') && finding.includes('(fs)'),
        ),
      );
      assert.ok(result.findings.some((finding) => finding.includes('(node:fs/promises)')));
      assert.ok(result.findings.some((finding) => finding.includes('(@neko/example-node)')));
      assert.ok(result.findings.some((finding) => finding.includes('(node:child_process)')));
      await writeFile(
        join(root, 'packages/example/webview/src/root.ts'),
        '// import fs from "node:fs";\nconst text = \'require("electron")\';',
      );
      assert.equal(
        (await checkApplicationBoundaries(root)).findings.some((finding) =>
          finding.includes('packages/example/webview/src/root.ts'),
        ),
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps domain-to-Webview and contract-to-runtime dependency rules active', () => {
    const rules = new Map(dependencyConfig.forbidden.map((rule) => [rule.name, rule]));
    const domainRule = rules.get('domain-no-webview-runtime');
    const contractRule = rules.get('contracts-no-runtime-implementation');
    assert.ok(new RegExp(domainRule.from.path).test('packages/cut/domain/src/index.ts'));
    assert.ok(new RegExp(domainRule.to.path).test('packages/cut/webview/src/root.tsx'));
    assert.equal(
      new RegExp(domainRule.from.path).test('packages/chara/webview/src/root.tsx'),
      false,
    );
    assert.ok(new RegExp(contractRule.from.path).test('packages/agent/contracts/src/index.ts'));
    assert.ok(new RegExp(contractRule.to.path).test('packages/agent/runtime/src/index.ts'));
  });

  it('rejects package-role omissions', () => {
    const findings = validatePackageRoleCatalog({ packages: [] }, [
      { path: 'packages/missing/domain', name: '@neko/missing-domain' },
    ]);
    assert.ok(findings.some((finding) => finding.includes('missing from role catalog')));
  });

  it('rejects non-canonical package scopes and redundant physical paths in executable inputs', () => {
    const findings = inspectNonCanonicalPackageNaming({
      path: 'vite.config.ts',
      source: "import '@neko-example/runtime'; const source = 'packages/neko-example-runtime/src';",
    });
    assert.deepEqual(
      findings.map((finding) => finding.rule),
      ['noncanonical-package-identity', 'noncanonical-package-path'],
    );
  });
});
