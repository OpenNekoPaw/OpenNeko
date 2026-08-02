import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePackageRoleCatalog } from './check-package-roles.mjs';

const validPackage = {
  path: 'packages/neko-example-domain',
  name: '@neko-example/domain',
  family: 'example',
  roles: ['contracts', 'domain'],
  runtimes: ['host-neutral'],
  productStatus: 'active-product',
  architectureState: 'converged',
};

describe('package role catalog', () => {
  it('accepts an exact first-level workspace inventory', () => {
    assert.deepEqual(
      validatePackageRoleCatalog({ version: 1, packages: [validPackage] }, [
        { path: validPackage.path, name: validPackage.name },
      ]),
      [],
    );
  });

  it('rejects omissions, unknown roles, identity drift and invalid runtime projections', () => {
    const findings = validatePackageRoleCatalog(
      {
        version: 1,
        packages: [
          {
            ...validPackage,
            name: '@neko-example/wrong',
            roles: ['webview', 'unknown-role'],
            runtimes: ['node'],
            unexpected: true,
          },
        ],
      },
      [
        { path: validPackage.path, name: validPackage.name },
        { path: 'packages/neko-missing', name: '@neko/missing' },
      ],
    );

    assert.ok(findings.some((finding) => finding.includes('unknown field: unexpected')));
    assert.ok(findings.some((finding) => finding.includes('unknown value: unknown-role')));
    assert.ok(
      findings.some((finding) => finding.includes('webview role requires browser runtime')),
    );
    assert.ok(findings.some((finding) => finding.includes('does not match manifest name')));
    assert.ok(findings.some((finding) => finding.includes('missing from role catalog')));
  });
});
