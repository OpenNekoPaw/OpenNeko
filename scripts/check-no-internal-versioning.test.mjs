import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAuditReport,
  isGeneratedDirectoryName,
  scanSources,
  validateAllowanceRegistry,
  validateCorrectnessAllowanceRegistry,
  validateDomainAllowanceRegistry,
} from './check-no-internal-versioning.mjs';

const forbiddenField = ['schema', 'Version'].join('');
const externalField = ['protocol', 'Version'].join('');

describe('internal versioning audit', () => {
  it('recognizes external HTTP endpoints and top-level npm manifest versions without exempting internal fields', () => {
    const findings = scanSources([
      {
        path: 'packages/example/package.json',
        content: '{"name":"example","version":"1.0.0","config":{"version":2}}',
      },
      {
        path: 'packages/example/src/api.ts',
        content:
          "const endpoint = 'https://api.example.com/v2/messages'; const schemaVersion = 2; const route = 'internal/v2/message';",
      },
    ]);
    assert.deepEqual(
      findings.map(({ token }) => token).sort(),
      ['/v2/', 'schemaVersion', 'version'].sort(),
    );
  });

  it('shares evidence while rejecting an unapproved sibling and malformed occurrence', () => {
    const findings = scanSources([
      {
        path: 'packages/example/src/adapter.ts',
        content: 'const first = { protocolVersion: a };\nconst second = { protocolVersion: b };',
      },
    ]);
    const registry = {
      allowances: [
        {
          externalOwner: 'External protocol',
          normativeSource: 'https://example.com/protocol',
          isolationRule: 'Only the external wire consumes this field.',
          occurrences: findings.map(({ id, path, category, token }) => ({
            id,
            path,
            category,
            token,
          })),
        },
      ],
    };
    assert.equal(buildAuditReport({ findings, allowanceRegistry: registry }).status, 'passed');
    registry.allowances[0].occurrences.pop();
    assert.equal(buildAuditReport({ findings, allowanceRegistry: registry }).violations.length, 1);
    registry.allowances[0].occurrences[0].extra = 'not allowed';
    assert.ok(
      validateAllowanceRegistry(registry, findings).some((error) => error.includes('exactly')),
    );
  });

  it('keeps generated DSH packaging stages outside the source audit', () => {
    assert.equal(isGeneratedDirectoryName('.dsh-runtime-stage'), true);
  });

  it('rejects versioned table generations and SQLite table version pragmas', () => {
    const generatedSchemaPath = ['packages/example/src/m1', 'schema.ts'].join('-');
    const generatedTableIdentifier = ['M1', 'TABLES'].join('_');
    const versionedTableName = ['records', 'v2'].join('_');
    const generationIdentifier = ['table', 'Generation'].join('');
    const sqliteTableVersionPragma = ['PRAGMA user', 'version = 2'].join('_');
    const findings = scanSources([
      {
        path: generatedSchemaPath,
        content: [
          `const ${generatedTableIdentifier} = [\`CREATE TABLE ${versionedTableName} (id TEXT PRIMARY KEY)\`];`,
          `const ${generationIdentifier} = 2;`,
          `database.exec(\`${sqliteTableVersionPragma}\`);`,
        ].join('\n'),
      },
    ]);

    assert.ok(findings.length >= 4);
    assert.ok(
      findings.every((finding) => finding.category.startsWith('versioned-table-generation')),
    );
  });

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
      new Set(['alternate-success-path', 'automatic-repair-or-rebuild', 'parallel-data-path']),
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

  it('keeps generated DSH development closures outside the internal contract audit', () => {
    assert.equal(isGeneratedDirectoryName('.dsh-development-runtime'), true);
    assert.equal(isGeneratedDirectoryName('packages'), false);
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
    const registry = groupAllowances([
      {
        id: finding.id,
        path: finding.path,
        category: finding.category,
        token: finding.token,
        externalOwner: 'Model Context Protocol',
        normativeSource: 'https://modelcontextprotocol.io/specification/latest/basic/lifecycle',
        isolationRule: 'The adapter does not project this field into an OpenNeko contract.',
      },
    ]);

    assert.deepEqual(validateAllowanceRegistry(registry, [finding]), []);
    const changed = scanSources([
      {
        path: 'packages/example/src/mcp-adapter.ts',
        content: `const request = { ${externalField}: otherNegotiatedValue };`,
      },
    ]);
    assert.ok(
      validateAllowanceRegistry(registry, changed).some((error) => error.includes('stale')),
    );
  });

  it('rejects every unapproved occurrence and passes only after removal or explicit allowance', () => {
    const findings = scanSources([
      { path: 'packages/example/src/state.ts', content: `const state = { ${forbiddenField}: 1 };` },
    ]);
    const allowanceRegistry = { allowances: [] };
    const report = buildAuditReport({ findings, allowanceRegistry });
    assert.equal(report.status, 'failed');
    assert.deepEqual(report.violations, findings);
    assert.equal(buildAuditReport({ findings: [], allowanceRegistry }).status, 'passed');
  });

  it('allows only exact Character or managed Asset domain occurrences inside their owners', () => {
    const [finding] = scanSources([
      {
        path: 'packages/chara/domain/src/character-project.ts',
        content: 'export interface CharacterVersion { characterVersion: string }',
      },
    ]);
    assert.ok(finding);
    const allowance = {
      id: finding.id,
      path: finding.path,
      category: finding.category,
      token: finding.token,
      domainOwner: '@neko/chara-domain',
      businessRequirement: 'Published character snapshots are immutable and user-referenceable.',
      isolationRule: 'The identity never selects a contract, codec, migration, or component shape.',
      userWorkflow: 'Users publish and select exact immutable character snapshots.',
    };

    assert.deepEqual(validateDomainAllowanceRegistry(groupAllowances([allowance]), [finding]), []);
    assert.ok(
      validateDomainAllowanceRegistry(
        groupAllowances([{ ...allowance, domainOwner: 'desktop-shell' }]),
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
      versionFreeAnalysis:
        'The store accepts writes from independent processes that cannot share an owner queue.',
      isolationRule: 'A mismatch rejects only the current write.',
      removalCondition: 'Remove when all writers share one serialized owner.',
    };

    assert.deepEqual(
      validateCorrectnessAllowanceRegistry(groupAllowances([allowance]), [finding]),
      [],
    );
    const { consumer: _consumer, ...incomplete } = allowance;
    assert.ok(
      validateCorrectnessAllowanceRegistry(groupAllowances([incomplete]), [finding]).some((error) =>
        error.includes('exactly'),
      ),
    );
  });
});

function groupAllowances(entries) {
  return {
    allowances: entries.map(({ id, path, category, token, ...evidence }) => ({
      ...evidence,
      occurrences: [{ id, path, category, token }],
    })),
  };
}
