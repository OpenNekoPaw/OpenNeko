import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { checkApplicationBoundaries } from './check-application-boundaries.mjs';
import {
  inspectApplicationResponsibility,
  inspectCanonicalPathFixture,
  inspectNonCanonicalPackageNaming,
  reconcileBoundaryExceptions,
} from './check-package-boundaries.mjs';
import { validatePackageRoleCatalog } from './check-package-roles.mjs';

const require = createRequire(import.meta.url);
const dependencyConfig = require('../.dependency-cruiser.cjs');

describe('architecture boundary failing fixtures', () => {
  it('rejects package-to-app, Webview-to-Node/Electron, and Main-to-React imports', async () => {
    const root = new URL('./fixtures/architecture-boundaries/', import.meta.url).pathname;
    const result = await checkApplicationBoundaries(root);
    assert.ok(result.findings.some((finding) => finding.includes('packages must not import')));
    assert.ok(result.findings.some((finding) => finding.includes('must not import Electron')));
    assert.ok(
      result.findings.some((finding) => finding.includes('renderer must remain browser-safe')),
    );
    assert.ok(result.findings.some((finding) => finding.includes('Main must not depend on React')));
  });

  it('keeps domain-to-Webview and contract-to-runtime dependency rules active', () => {
    const rules = new Map(dependencyConfig.forbidden.map((rule) => [rule.name, rule]));
    const domainRule = rules.get('domain-no-webview-runtime');
    const contractRule = rules.get('contracts-no-runtime-implementation');
    assert.ok(new RegExp(domainRule.from.path).test('packages/cut/domain/src/index.ts'));
    assert.ok(new RegExp(domainRule.to.path).test('packages/cut/webview/src/root.tsx'));
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

  it('rejects business ownership in apps and successful replaced paths', () => {
    const findings = [
      ...inspectApplicationResponsibility({
        path: 'apps/neko-desktop/src/main/domain-service.ts',
        responsibility: 'business-owner',
      }),
      ...inspectCanonicalPathFixture({
        path: 'apps/neko-desktop/src/main/replaced-adapter.ts',
        replacedPathReturnsSuccess: true,
      }),
    ];
    const result = reconcileBoundaryExceptions(findings, { exceptions: [] });
    assert.deepEqual(
      result.unapproved.map((finding) => finding.rule),
      ['business-owner-in-app', 'replaced-path-success'],
    );
  });
});
