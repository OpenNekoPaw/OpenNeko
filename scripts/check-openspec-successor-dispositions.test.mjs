import assert from 'node:assert/strict';
import test from 'node:test';

import { auditOpenSpecResidue } from './check-openspec-successor-dispositions.mjs';

const baseInput = {
  activeChanges: ['current-change'],
  activeArtifactPaths: [
    'current-change/.openspec.yaml',
    'current-change/design.md',
    'current-change/proposal.md',
    'current-change/specs/capability/spec.md',
    'current-change/tasks.md',
  ],
  archivedChanges: [],
  canonicalSpecs: ['product-capability'],
  documents: [],
  forbiddenDocumentRoots: [],
  forbiddenActivePromisePatterns: [
    { id: 'standalone', pattern: /Standalone Character authoring SHALL/iu },
  ],
  retiredChanges: ['old-change'],
  retiredSpecs: ['local-ui-detail'],
};

test('accepts a clean active area without completed proposal history', () => {
  assert.deepEqual(auditOpenSpecResidue(baseInput), []);
});

test('rejects a superseded proposal that remains active', () => {
  const violations = auditOpenSpecResidue({
    ...baseInput,
    activeChanges: ['current-change', 'old-change'],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'retired-change-residue');
  assert.equal(violations[0]?.path, 'old-change');
});

test('rejects completed proposal history left in the archive directory', () => {
  const violations = auditOpenSpecResidue({
    ...baseInput,
    archivedChanges: ['2026-08-21-completed-change'],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'archived-proposal-residue');
});

test('rejects implementation evidence and other detailed active artifacts', () => {
  const violations = auditOpenSpecResidue({
    ...baseInput,
    activeArtifactPaths: [
      ...baseInput.activeArtifactPaths,
      'current-change/verification.md',
      'current-change/evidence/report.json',
    ],
  });

  assert.deepEqual(
    violations.map((violation) => violation.kind),
    ['detailed-active-artifact', 'detailed-active-artifact'],
  );
});

test('rejects retired detail specs and noncanonical document roots', () => {
  const violations = auditOpenSpecResidue({
    ...baseInput,
    canonicalSpecs: ['product-capability', 'local-ui-detail'],
    forbiddenDocumentRoots: ['docs/status'],
  });

  assert.deepEqual(
    violations.map((violation) => violation.kind),
    ['detailed-canonical-spec-residue', 'noncanonical-document-root'],
  );
});

test('rejects detailed task ledgers and fully completed active proposals', () => {
  const detailedTasks = Array.from(
    { length: 9 },
    (_, index) => `- [x] ${index + 1}. Product milestone`,
  ).join('\n');
  const violations = auditOpenSpecResidue({
    ...baseInput,
    documents: [{ path: 'current-change/tasks.md', content: detailedTasks }],
  });

  assert.deepEqual(
    violations.map((violation) => violation.kind),
    ['detailed-task-ledger', 'completed-proposal-residue'],
  );
});

test('rejects a retired active requirement', () => {
  const violations = auditOpenSpecResidue({
    ...baseInput,
    documents: [
      {
        path: 'current-change/specs/capability/spec.md',
        content: [
          '### Requirement: Retired standalone creation',
          'Standalone Character authoring SHALL create mutable records.',
        ].join('\n'),
      },
    ],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'active-retired-promise');
});

test('rejects a retired promise in an active proposal', () => {
  const violations = auditOpenSpecResidue({
    ...baseInput,
    documents: [
      {
        path: 'current-change/proposal.md',
        content: 'Standalone Character authoring SHALL create mutable records.',
      },
    ],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'active-retired-promise');
});

test('rejects a retired unchecked task but ignores completed historical wording', () => {
  const violations = auditOpenSpecResidue({
    ...baseInput,
    documents: [
      {
        path: 'current-change/tasks.md',
        content: [
          '- [x] 1.1 Standalone Character authoring SHALL remain available.',
          '- [ ] 1.2 Standalone Character authoring SHALL be restored.',
        ].join('\n'),
      },
    ],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'active-retired-promise');
});
