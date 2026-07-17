import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema as s, validateStrict } from '../schemas/strict-schema.mjs';

const DEFAULT_ROOT = dirname(fileURLToPath(import.meta.url));
const ID = s.string({ pattern: /^[a-z0-9][a-z0-9._-]*$/u, maxLength: 160 });
const TEXT = s.string({ minLength: 1, maxLength: 2_000 });
const SUITE_IDS = s.array(ID, { minLength: 1, maxLength: 100 });

const COVERED_TARGET = s.object({
  kind: s.enum(['builtin-skill', 'prompt-layer', 'agent-runtime-capability']),
  id: ID,
  disposition: s.literal('suite'),
  suiteIds: SUITE_IDS,
});
const EXCLUDED_TARGET = s.object({
  kind: s.enum(['builtin-skill', 'prompt-layer', 'agent-runtime-capability']),
  id: ID,
  disposition: s.literal('excluded'),
  deterministicValidation: s.object({ command: TEXT, reason: TEXT }),
});
const MIGRATED_LEGACY_CASE = s.object({
  id: ID,
  disposition: s.literal('migrated'),
  replacements: s.array(s.object({ suiteId: ID, caseId: ID }), {
    minLength: 1,
    maxLength: 20,
  }),
});
const EXCLUDED_LEGACY_CASE = s.object({
  id: ID,
  disposition: s.literal('excluded'),
  reason: TEXT,
});
const COVERAGE_INDEX_SCHEMA = s.object({
  schema: s.literal('neko.agent-eval.coverage-index.v2'),
  targets: s.array(s.union([COVERED_TARGET, EXCLUDED_TARGET]), {
    minLength: 1,
    maxLength: 500,
  }),
  legacyCases: s.array(s.union([MIGRATED_LEGACY_CASE, EXCLUDED_LEGACY_CASE]), {
    minLength: 1,
    maxLength: 500,
  }),
});

export const EXPECTED_BUILTIN_SKILLS = Object.freeze([
  'skill-creator',
  'storyboard',
  'image',
  'video',
  'media-production',
  'media-quality-review',
  'scene-to-music',
  'video-editing',
  'color-grading',
  'audio-mixing',
  'subtitle-assistant',
  'script-generation',
  'script-to-timeline',
]);
const EXPECTED_PROMPT_LAYERS = Object.freeze([
  'base',
  'schema',
  'skill',
  'environment',
  'ephemeral',
]);
const EXPECTED_RUNTIME_CAPABILITIES = Object.freeze([
  'evaluation-platform',
  'tui-debug-facts',
  'prompt-composition',
  'skill-runtime',
  'capability-tool-routing',
  'provider-model-routing',
  'session-workflows',
  'task-recovery',
  'creative-media-workflow',
  'tui-event-projection',
]);
const EXPECTED_LEGACY_CASES = Object.freeze([
  'cat-play-image-analysis',
  'storyboard-distinct-image-video-prompts',
  'comic-description-canonical-storyboard-skill',
  'blame-epub-storyboard-to-canvas',
  'blame-epub-canonical-storyboard-skill',
  'lamp-god-epub-animation-plan',
  'image-analysis-uses-perception-tool-when-chat-differs',
  'image-analysis-uses-native-chat-vision-when-chat-matches-perception',
  'explicit-system-skill-creator',
  'native-create-project-skill',
  'native-create-rejects-invalid-skill',
  'native-create-rejects-resource-traversal',
  'native-create-rejects-existing-target',
  'stream-tool-text-order-and-final-answer',
  'active-stream-cancellation',
  'mixed-gfm-unicode-resize',
  'incomplete-fence-table-streaming',
  'unsafe-terminal-controls-in-markdown',
]);

export async function loadCoverageIndex(options = {}) {
  const root = resolve(options.root ?? DEFAULT_ROOT);
  const input = JSON.parse(await fs.readFile(resolve(root, 'coverage-index.json'), 'utf8'));
  validateStrict(input, COVERAGE_INDEX_SCHEMA, 'coverageIndex');
  validateUnique(
    input.targets.map((item) => `${item.kind}:${item.id}`),
    'coverage targets',
  );
  validateUnique(
    input.legacyCases.map((item) => item.id),
    'legacy Evaluation cases',
  );
  validateInventory(input);
  if (options.suites) validateSuiteReferences(input, options.suites);
  return input;
}

function validateInventory(index) {
  validateExactInventory(index, 'builtin-skill', EXPECTED_BUILTIN_SKILLS);
  validateExactInventory(index, 'prompt-layer', EXPECTED_PROMPT_LAYERS);
  validateExactInventory(index, 'agent-runtime-capability', EXPECTED_RUNTIME_CAPABILITIES);
  validateExactValues(
    index.legacyCases.map((item) => item.id),
    EXPECTED_LEGACY_CASES,
    'legacy Evaluation cases',
  );
  const invalidSkillExclusions = index.targets.filter(
    (item) => item.kind === 'builtin-skill' && item.disposition === 'excluded',
  );
  if (invalidSkillExclusions.length > 0) {
    throw new Error(
      `builtin Skills require real suite coverage: ${invalidSkillExclusions.map((item) => item.id).join(', ')}`,
    );
  }
}

function validateExactInventory(index, kind, expected) {
  validateExactValues(
    index.targets.filter((item) => item.kind === kind).map((item) => item.id),
    expected,
    kind,
  );
}

function validateExactValues(actual, expected, label) {
  const missing = expected.filter((id) => !actual.includes(id));
  const stale = actual.filter((id) => !expected.includes(id));
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `${label} coverage mismatch; missing=${missing.join(',') || 'none'} stale=${stale.join(',') || 'none'}`,
    );
  }
}

function validateSuiteReferences(index, suites) {
  const byId = new Map(suites.map((entry) => [entry.suite.id, entry]));
  for (const target of index.targets) {
    if (target.disposition !== 'suite') continue;
    for (const suiteId of target.suiteIds) {
      const suite = byId.get(suiteId);
      if (!suite)
        throw new Error(
          `coverage target ${target.kind}/${target.id} references missing suite ${suiteId}`,
        );
      if (
        target.kind === 'builtin-skill' &&
        (suite.suite.target.kind !== 'skill' || suite.suite.target.identity.name !== target.id)
      ) {
        throw new Error(
          `builtin Skill ${target.id} coverage must reference its exact Skill target suite`,
        );
      }
    }
  }
  for (const legacy of index.legacyCases) {
    if (legacy.disposition !== 'migrated') continue;
    for (const replacement of legacy.replacements) {
      const suite = byId.get(replacement.suiteId);
      if (!suite)
        throw new Error(`legacy case ${legacy.id} references missing suite ${replacement.suiteId}`);
      if (!suite.cases.some((item) => item.scenario.id === replacement.caseId)) {
        throw new Error(
          `legacy case ${legacy.id} references missing case ${replacement.suiteId}/${replacement.caseId}`,
        );
      }
    }
  }
}

function validateUnique(values, label) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`${label} must be unique; duplicate=${duplicate}`);
}
