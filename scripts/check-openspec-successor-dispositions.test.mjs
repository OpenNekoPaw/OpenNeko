import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditSuccessorDispositions,
  normalizeArchivedDocument,
} from './check-openspec-successor-dispositions.mjs';

const baseInput = {
  forbiddenActivePromisePatterns: [
    { id: 'standalone', pattern: /Standalone Character authoring SHALL/iu },
  ],
  governedChanges: ['old-change'],
  requiredDispositionFiles: ['old-change/specs/capability/spec.md'],
  retiredPromisePatterns: [{ id: 'standalone', pattern: /standalone-library/iu }],
  successorChange: 'new-change',
  successorMarker: 'SUCCESSOR: new-change',
  successorScopeFiles: ['new-change/proposal.md'],
};

test('accepts an explicitly classified predecessor and complete successor scope', () => {
  assert.deepEqual(
    auditSuccessorDispositions({
      ...baseInput,
      documents: [
        {
          change: 'old-change',
          path: 'old-change/specs/capability/spec.md',
          normative: true,
          content: '<!-- SUCCESSOR: new-change -->\nstandalone-library is historical.',
        },
        {
          change: 'new-change',
          path: 'new-change/proposal.md',
          normative: true,
          content: 'This successor reconciles old-change.',
        },
      ],
    }),
    [],
  );
});

test('resolves archived predecessor and successor artifacts without treating them as active promises', () => {
  const predecessor = normalizeArchivedDocument({
    change: 'archive',
    path: 'archive/2026-08-21-old-change/specs/capability/spec.md',
    normative: false,
    content: [
      '### Requirement: Historical promise',
      'Standalone Character authoring SHALL create mutable records.',
      '<!-- SUCCESSOR: new-change -->',
    ].join('\n'),
  });
  const successor = normalizeArchivedDocument({
    change: 'archive',
    path: 'archive/2026-08-21-new-change/proposal.md',
    normative: false,
    content: 'This successor reconciles old-change.',
  });

  assert.deepEqual(
    auditSuccessorDispositions({
      ...baseInput,
      documents: [predecessor, successor],
    }),
    [],
  );
});

test('rejects a contradictory requirement even when the file has a successor marker', () => {
  const violations = auditSuccessorDispositions({
    ...baseInput,
    documents: [
      {
        change: 'old-change',
        path: 'old-change/specs/capability/spec.md',
        normative: true,
        content: [
          '## ADDED Requirements',
          '',
          '### Requirement: Retired standalone creation',
          '',
          'Standalone Character authoring SHALL create mutable records.',
          '',
          '<!-- SUCCESSOR: new-change -->',
        ].join('\n'),
      },
      {
        change: 'new-change',
        path: 'new-change/proposal.md',
        normative: true,
        content: 'This successor reconciles old-change.',
      },
    ],
  });

  assert.ok(violations.some((violation) => violation.kind === 'active-retired-promise'));
});

test('rejects a contradictory unchecked task even when the file has a successor marker', () => {
  const violations = auditSuccessorDispositions({
    ...baseInput,
    requiredDispositionFiles: ['old-change/tasks.md'],
    documents: [
      {
        change: 'old-change',
        path: 'old-change/tasks.md',
        normative: true,
        content: [
          '- [ ] 1.1 Standalone Character authoring SHALL remain available.',
          '<!-- SUCCESSOR: new-change -->',
        ].join('\n'),
      },
      {
        change: 'new-change',
        path: 'new-change/proposal.md',
        normative: true,
        content: 'This successor reconciles old-change.',
      },
    ],
  });

  assert.ok(violations.some((violation) => violation.kind === 'active-retired-promise'));
});

test('rejects a new active retired promise without an explicit disposition', () => {
  const violations = auditSuccessorDispositions({
    ...baseInput,
    documents: [
      {
        change: 'old-change',
        path: 'old-change/specs/capability/spec.md',
        normative: true,
        content: '<!-- SUCCESSOR: new-change -->\nstandalone-library is historical.',
      },
      {
        change: 'another-change',
        path: 'another-change/proposal.md',
        normative: true,
        content: 'Add standalone-library authoring.',
      },
      {
        change: 'new-change',
        path: 'new-change/proposal.md',
        normative: true,
        content: 'This successor reconciles old-change.',
      },
    ],
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'unclassified-retired-promise');
  assert.equal(violations[0]?.path, 'another-change/proposal.md');
});

test('rejects missing predecessor markers and incomplete successor scope', () => {
  const violations = auditSuccessorDispositions({
    ...baseInput,
    documents: [
      {
        change: 'old-change',
        path: 'old-change/specs/capability/spec.md',
        normative: true,
        content: 'standalone-library remains active.',
      },
      {
        change: 'new-change',
        path: 'new-change/proposal.md',
        normative: true,
        content: 'Successor proposal without predecessor list.',
      },
    ],
  });

  assert.ok(violations.some((violation) => violation.kind === 'missing-successor-marker'));
  assert.ok(violations.some((violation) => violation.kind === 'unclassified-retired-promise'));
  assert.ok(violations.some((violation) => violation.kind === 'incomplete-successor-scope'));
});
