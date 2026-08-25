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

  it('rejects a family root package mixed with nested role packages', () => {
    const root = {
      path: 'packages/example',
      name: '@neko/example',
      family: 'example',
      roles: ['domain'],
      runtimes: ['host-neutral'],
      productStatus: 'active-product',
      architectureState: 'converged',
    };
    const nested = {
      ...validPackage,
      path: 'packages/example/dsh-plugin',
      name: '@neko/example-dsh-plugin',
    };
    const findings = validatePackageRoleCatalog({ packages: [root, nested] }, [
      { path: root.path, name: root.name },
      { path: nested.path, name: nested.name },
    ]);
    assert.ok(
      findings.some((finding) =>
        finding.includes('family root workspace must not coexist with nested role packages'),
      ),
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

  it('rejects flat sibling role packages', () => {
    const flat = {
      ...validPackage,
      path: 'packages/example-webview',
      name: '@neko/example-webview',
      roles: ['webview'],
      runtimes: ['browser'],
    };
    const findings = validatePackageRoleCatalog({ packages: [flat] }, [
      { path: flat.path, name: flat.name },
    ]);

    assert.ok(findings.some((finding) => finding.includes('packages/<family>/<role>')));
  });
});
