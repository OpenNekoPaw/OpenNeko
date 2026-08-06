import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAuditReport,
  scanSources,
  validateAllowanceRegistry,
  validateCorrectnessAllowanceRegistry,
  validateDomainAllowanceRegistry,
} from './check-no-internal-versioning.mjs';

const forbiddenField = ['schema', 'Version'].join('');
const externalField = ['protocol', 'Version'].join('');

describe('internal versioning audit', () => {
  it('detects internal fields, aliases, numeric keys and product migration paths', () => {
    const findings = scanSources([
      {
        path: ['packages/example/src/data-', 'migration.ts'].join(''),
        content: [
          `const payload = { ${forbiddenField}: 1, revision: 2 };`,
          `const storageKey = 'component-v2';`,
        ].join('\n'),
      },
    ]);

    assert.deepEqual(
      new Set(findings.map((finding) => finding.category)),
      new Set([
        'data-generation-alias',
        'internal-version-field',
        'product-migration-or-compatibility-path',
        'versioned-path-or-key',
      ]),
    );
  });

  it('detects explicit and hidden alternate-path markers', () => {
    const findings = scanSources([
      {
        path: 'packages/example/src/canonical-runtime.ts',
        content: [
          'const dualRead = true;',
          'const cacheOrSource = true;',
          'const automaticRepair = true;',
          'const autoRebuildProjection = true;',
          'const fallbackHandler = true;',
          'const defaultHandler = true;',
          'const implicitSession = true;',
          'const fallbackToActive = true;',
          'const tryNextProvider = true;',
        ].join('\n'),
      },
    ]);

    assert.deepEqual(
      new Set(findings.map((finding) => finding.category)),
      new Set([
        'alternate-success-path',
        'automatic-repair-or-rebuild',
        'parallel-data-path',
      ]),
    );
  });

  it('does not reject adapter, projection, freshness or loading terminology by itself', () => {
    const findings = scanSources([
      {
        path: 'packages/example/src/canonical-runtime.ts',
        content: [
          'const adapter = selectedProvider;',
          'const projection = project(authoritativeSource);',
          'const sourceFingerprint = digest(source);',
          'const defaultProvider = configuredProvider;',
          'const fallback = loadingPresentation;',
        ].join('\n'),
      },
    ]);

    assert.deepEqual(findings, []);
  });

  it('distinguishes AI generation domain data from numeric generation counters', () => {
    const findings = scanSources([
      {
        path: 'packages/example/src/generation-runtime.ts',
        content: [
          'interface Result { generation: GeneratedMedia }',
          'class Runtime { private requestGeneration = 0 }',
          'const snapshot = runtime.requestGeneration;',
        ].join('\n'),
      },
    ]);

    assert.deepEqual(
      findings.map(({ token, category }) => ({ token, category })),
      [{ token: 'requestGeneration', category: 'data-generation-alias' }],
    );
  });

  it('does not duplicate a declared token for every property read', () => {
    const findings = scanSources([
      {
        path: 'packages/example/src/runtime.ts',
        content: [
          'interface State { revision: number }',
          'function read(state: State) { return state.revision + state.revision; }',
        ].join('\n'),
      },
    ]);

    assert.equal(findings.filter((finding) => finding.token === 'revision').length, 1);
  });

  it('does not extract alternate-path markers from diagnostic prose', () => {
    const findings = scanSources([
      {
        path: 'packages/example/src/canonical-runtime.test.ts',
        content:
          "const expectedFailure = 'A fallback writer, different error, or partial result fails.';",
      },
    ]);

    assert.deepEqual(findings, []);
  });

  it('accepts only an exact evidence-backed external occurrence', () => {
    const [finding] = scanSources([
      {
        path: 'packages/example/src/mcp-adapter.ts',
        content: `const request = { ${externalField}: negotiated };`,
      },
    ]);
    assert.ok(finding);
    const registry = {
      allowances: [
        {
          id: finding.id,
          path: finding.path,
          category: finding.category,
          token: finding.token,
          externalOwner: 'Model Context Protocol',
          normativeSource: 'https://modelcontextprotocol.io/specification/latest/basic/lifecycle',
          fieldScope: 'MCP initialize request adapter only',
          isolationRule: 'The adapter does not project this field into an OpenNeko contract.',
        },
      ],
    };

    assert.deepEqual(validateAllowanceRegistry(registry, [finding]), []);
    const changed = scanSources([
      {
        path: 'packages/example/src/mcp-adapter.ts',
        content: `const request = { ${externalField}: otherNegotiatedValue };`,
      },
    ]);
    assert.ok(validateAllowanceRegistry(registry, changed).some((error) => error.includes('stale')));
  });

  it('permits deletion from the baseline and rejects any new occurrence', () => {
    const original = scanSources([
      { path: 'packages/example/src/state.ts', content: `const state = { ${forbiddenField}: 1 };` },
    ]);
    const baseline = { owners: [{ owner: 'packages/example', findings: original }] };
    const emptyRegistry = { allowances: [] };

    const removed = buildAuditReport({ findings: [], allowanceRegistry: emptyRegistry, baseline });
    assert.equal(removed.status, 'passed');
    assert.deepEqual(removed.remaining, []);

    const added = scanSources([
      { path: 'packages/example/src/other.ts', content: 'const rendererEpoch = 1;' },
    ]);
    const report = buildAuditReport({ findings: added, allowanceRegistry: emptyRegistry, baseline });
    assert.equal(report.status, 'failed');
    assert.equal(report.summary.newInternalDebt, 1);
    assert.deepEqual(report.remaining, []);
  });

  it('allows only exact Character or managed Asset domain occurrences inside their owners', () => {
    const [finding] = scanSources([
      {
        path: 'packages/chara/src/character-project.ts',
        content: 'export interface CharacterVersion { characterVersion: string }',
      },
    ]);
    assert.ok(finding);
    const allowance = {
      id: finding.id,
      path: finding.path,
      category: finding.category,
      token: finding.token,
      domainOwner: '@neko/chara',
      businessRequirement: 'Published character snapshots are immutable and user-referenceable.',
      fieldScope: 'Character publication identity only.',
      isolationRule: 'The identity never selects a contract, codec, migration, or component shape.',
      userWorkflow: 'Users publish and select exact immutable character snapshots.',
    };

    assert.deepEqual(validateDomainAllowanceRegistry({ allowances: [allowance] }, [finding]), []);
    assert.ok(
      validateDomainAllowanceRegistry(
        { allowances: [{ ...allowance, domainOwner: 'desktop-shell' }] },
        [finding],
      ).some((error) => error.includes('owning @neko package')),
    );
  });

  it('requires evidence for an unavoidable internal correctness token', () => {
    const [finding] = scanSources([
      {
        path: 'packages/example/src/store.ts',
        content: 'const expectedRevision = request.expectedRevision;',
      },
    ]);
    assert.ok(finding);
    const allowance = {
      id: finding.id,
      path: finding.path,
      category: finding.category,
      token: finding.token,
      owner: '@neko/example',
      consumer: 'Atomic store compare-and-swap operation.',
      correctnessInvariant: 'A stale concurrent writer cannot overwrite a committed user edit.',
      versionFreeAnalysis: 'The store accepts writes from independent processes that cannot share an owner queue.',
      fieldScope: 'One store write precondition only.',
      isolationRule: 'A mismatch rejects only the current write.',
      removalCondition: 'Remove when all writers share one serialized owner.',
    };

    assert.deepEqual(
      validateCorrectnessAllowanceRegistry({ allowances: [allowance] }, [finding]),
      [],
    );
    const { consumer: _consumer, ...incomplete } = allowance;
    assert.ok(
      validateCorrectnessAllowanceRegistry({ allowances: [incomplete] }, [finding]).some(
        (error) => error.includes('exactly'),
      ),
    );
  });
});
