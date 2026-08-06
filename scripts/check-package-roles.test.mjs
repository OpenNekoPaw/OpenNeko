import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePackageRoleCatalog } from './check-package-roles.mjs';

const validPackage = {
  path: 'packages/example/domain',
  name: '@neko/example-domain',
  family: 'example',
  roles: ['contracts', 'domain'],
  runtimes: ['host-neutral'],
  productStatus: 'active-product',
  architectureState: 'converged',
};

describe('package role catalog', () => {
  it('accepts a canonical grouped workspace inventory', () => {
    assert.deepEqual(
      validatePackageRoleCatalog({ packages: [validPackage] }, [
        { path: validPackage.path, name: validPackage.name },
      ]),
      [],
    );
  });

  it('rejects omissions, unknown roles, identity drift and invalid runtime projections', () => {
    const findings = validatePackageRoleCatalog(
      {
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
        { path: 'packages/missing', name: '@neko/missing' },
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

  it('rejects legacy scopes, redundant prefixes and path/name mismatches', () => {
    const findings = validatePackageRoleCatalog(
      {
        packages: [
          {
            ...validPackage,
            path: 'packages/neko-example-domain',
            name: '@neko-example/domain',
          },
        ],
      },
      [{ path: 'packages/neko-example-domain', name: '@neko-example/domain' }],
    );

    assert.ok(findings.some((finding) => finding.includes('redundant packages/neko-*')));
    assert.ok(findings.some((finding) => finding.includes('single @neko/* scope')));
  });
});
