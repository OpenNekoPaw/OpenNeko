import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateStrictCompilerOptions } from './check-strict-tsconfig.mjs';

describe('strict TypeScript compiler options', () => {
  it('requires all repository hard constraints', () => {
    assert.deepEqual(
      validateStrictCompilerOptions('fixture', {
        strict: true,
        noUncheckedIndexedAccess: true,
        noImplicitOverride: true,
      }),
      [],
    );

    const findings = validateStrictCompilerOptions('fixture', { strict: true });
    assert.ok(findings.some((finding) => finding.includes('noUncheckedIndexedAccess')));
    assert.ok(findings.some((finding) => finding.includes('noImplicitOverride')));
  });
});
