import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectRuntimeModuleSpecifiers,
  compareProductStatuses,
  computeReachableModules,
  validateProductStatusConfiguration,
} from './check-package-product-status.mjs';

describe('package product status reachability', () => {
  it('keeps value imports, re-exports and literal dynamic imports while erasing explicit types', () => {
    const imports = collectRuntimeModuleSpecifiers(`
      import type { TypeOnly } from '@neko/type-only';
      import { type NamedType } from '@neko/named-type-only';
      import { runtimeValue, type MixedType } from '@neko/runtime';
      export type { ExportedType } from '@neko/export-type-only';
      export { runtimeExport } from '@neko/re-export';
      const loaded = import('@neko/dynamic');
    `);

    assert.deepEqual(imports, ['@neko/runtime', '@neko/re-export', '@neko/dynamic']);
  });

  it('activates only modules reachable through production or declared dynamic edges', () => {
    const modules = new Map([
      ['app.ts', [{ target: 'runtime.ts', specifier: './runtime', evidence: 'source' }]],
      ['runtime.ts', []],
      ['test-only.ts', [{ target: 'retained.ts', specifier: './retained', evidence: 'source' }]],
      ['retained.ts', []],
      ['registry.ts', []],
      ['plugin.ts', []],
    ]);
    const result = computeReachableModules({
      entries: ['app.ts', 'registry.ts'],
      modules,
      declaredEdges: [
        {
          source: 'registry.ts',
          target: 'plugin.ts',
          targetPackage: '@neko/plugin',
        },
      ],
    });

    assert.deepEqual([...result.reachable].sort(), [
      'app.ts',
      'plugin.ts',
      'registry.ts',
      'runtime.ts',
    ]);
    assert.equal(result.reachable.has('retained.ts'), false);
  });

  it('reports the owning path when a retained kernel becomes runtime reachable', () => {
    const findings = compareProductStatuses({
      catalog: {
        packages: [
          { name: '@neko/runtime', productStatus: 'active-product' },
          { name: '@neko/retained', productStatus: 'retained-kernel' },
          { name: '@neko/test-only', productStatus: 'retained-kernel' },
        ],
      },
      reachablePackages: new Set(['@neko/runtime', '@neko/retained']),
      packagePaths: new Map([
        ['@neko/runtime', ['app.ts', 'app.ts --@neko/runtime--> runtime.ts']],
        ['@neko/retained', ['app.ts', 'runtime.ts --@neko/retained--> retained.ts']],
      ]),
    });

    assert.equal(findings.length, 1);
    assert.match(findings[0], /@neko\/retained.*retained-kernel.*runtime\.ts/u);
  });

  it('rejects generic, incomplete and expired dynamic-edge declarations', () => {
    const findings = validateProductStatusConfiguration(
      {
        version: 1,
        applicationEntries: ['app.ts'],
        migrationOnlyModules: [],
        dynamicEdges: [
          {
            kind: 'generic-allowlist',
            source: 'registry.ts',
            targetPackage: '@neko/plugin',
            owner: '',
            reason: 'loaded by registry',
            validationPath: 'registry.test.ts',
            reviewCondition: 'remove when imports become literal',
            expiresOn: '2026-01-01',
          },
        ],
      },
      { now: Date.parse('2026-08-03T00:00:00Z'), pathExists: () => true },
    );

    assert.ok(findings.some((finding) => finding.includes('kind must equal')));
    assert.ok(findings.some((finding) => finding.includes('owner must be a non-empty string')));
    assert.ok(findings.some((finding) => finding.includes('has expired')));
  });
});
