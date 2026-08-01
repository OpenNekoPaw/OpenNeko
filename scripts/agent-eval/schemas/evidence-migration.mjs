import { schema as s, validateStrict } from './strict-schema.mjs';

const EVIDENCE_MIGRATION_SCHEMA = 'neko.agent-eval.host-evidence-migration.v1';

const SHORT_TEXT = s.string({ minLength: 1, maxLength: 1_000 });
const REF = s.string({ minLength: 1, maxLength: 500, pattern: /^\S(?:.*\S)?$/u });

const MIGRATION_LEDGER_SCHEMA = s.object({
  schema: s.literal(EVIDENCE_MIGRATION_SCHEMA),
  retiredHost: s.object({
    kind: s.literal('tui'),
    identity: REF,
    status: s.literal('retired'),
  }),
  desktopBaselinePolicy: s.object({
    targetHost: s.literal('desktop'),
    historicalTuiComparison: s.literal('non-comparable'),
    requiresNewDesktopBaseline: s.literal(true),
  }),
  reusableMappings: s.array(
    s.object({
      kind: s.enum(['scenario-intent', 'fixture', 'validator', 'rubric']),
      sourceRef: REF,
      desktopRefs: s.array(REF, { minLength: 1, maxLength: 100 }),
    }),
    { minLength: 1, maxLength: 100 },
  ),
  retiredBehaviors: s.array(
    s.object({
      id: REF,
      reason: SHORT_TEXT,
      disposition: s.enum(['retired', 'reauthor-as-desktop-visible-scenario']),
    }),
    { minLength: 1, maxLength: 100 },
  ),
});

export function validateEvidenceMigrationLedger(input) {
  validateStrict(input, MIGRATION_LEDGER_SCHEMA, 'hostEvidenceMigrationLedger');
  const reusableKinds = new Set(input.reusableMappings.map((mapping) => mapping.kind));
  for (const required of ['scenario-intent', 'fixture', 'validator', 'rubric']) {
    if (!reusableKinds.has(required)) {
      throw new Error(`hostEvidenceMigrationLedger is missing reusable ${required} mappings`);
    }
  }
  return input;
}

export function assertDesktopBaselineCandidate(input) {
  if (input?.executionHost?.kind !== 'desktop') {
    const observed = input?.executionHost?.kind ?? 'missing';
    throw Object.assign(
      new Error(
        `Desktop baseline requires executionHost.kind=desktop; observed=${observed}; historical TUI evidence is non-comparable`,
      ),
      { code: 'non-comparable' },
    );
  }
  return input;
}
