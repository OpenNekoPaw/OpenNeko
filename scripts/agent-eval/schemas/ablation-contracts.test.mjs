import { describe, expect, it } from 'vitest';
import {
  ABLATION_METRICS,
  ABLATION_SCHEMAS,
  validateAblationPlan,
  validateAblationQualityContract,
} from './ablation-contracts.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function comparisonPolicy() {
  return {
    retainEverySample: true,
    correctnessDominates: true,
    metrics: [...ABLATION_METRICS],
    quality: { kind: 'hard-gates-only', reason: 'The focused pilot has deterministic gates.' },
  };
}

function configurationPlan() {
  return {
    schema: ABLATION_SCHEMAS.plan,
    id: 'thinking-budget-pilot',
    mode: 'configuration',
    suiteId: 'agent-runtime.single-message-tui',
    caseId: 'canonical-answer',
    baselineVariantId: 'baseline',
    matrix: { strategy: 'focused', maxVariants: 4 },
    repetitions: 3,
    comparisonPolicy: comparisonPolicy(),
    variants: [
      {
        id: 'baseline',
        role: 'baseline',
        kind: 'configuration',
        description: 'Canonical no-thinking profile.',
        changes: [],
        runtimeProfileId: 'thinking-0',
        modelProfileId: 'configured-default',
        expectedConfiguration: {
          runtimeProfileId: 'thinking-0',
          runtimeConfigurationHash: HASH_A,
          modelProfileId: 'configured-default',
          modelConfigurationHash: HASH_B,
        },
        expectedPath: ['TUI App session owner', 'session.create runtimeConfig'],
        forbiddenFallback: ['active session configuration', 'direct AgentSession runner'],
      },
      {
        id: 'thinking-128',
        role: 'variant',
        kind: 'configuration',
        description: 'One supported thinking-budget change.',
        changes: ['runtime.thinking-budget'],
        runtimeProfileId: 'thinking-128',
        modelProfileId: 'configured-default',
        expectedConfiguration: {
          runtimeProfileId: 'thinking-128',
          runtimeConfigurationHash: HASH_C,
          modelProfileId: 'configured-default',
          modelConfigurationHash: HASH_B,
        },
        expectedPath: ['TUI App session owner', 'session.create runtimeConfig'],
        forbiddenFallback: ['active session configuration', 'direct AgentSession runner'],
      },
    ],
  };
}

function implementationPlan() {
  const plan = configurationPlan();
  return {
    ...plan,
    id: 'skill-content-pilot',
    mode: 'implementation',
    comparisonPolicy: {
      ...comparisonPolicy(),
      quality: { kind: 'scenario-rubric', rubricRef: 'rubrics/storyboard-quality.json' },
    },
    variants: ['baseline', 'concise-method'].map((id, index) => ({
      id,
      role: index === 0 ? 'baseline' : 'variant',
      kind: 'implementation',
      description: index === 0 ? 'Base Skill content.' : 'Isolated Skill content revision.',
      changes: index === 0 ? [] : ['skill-content'],
      skillIdentity: {
        name: 'storyboard',
        source: 'builtin',
        provenance: 'builtin',
        rootId: 'builtin-skills',
        relativePath: 'storyboard',
        fingerprint: index === 0 ? HASH_A : HASH_B,
      },
      developmentCheckpoint: {
        kind: 'git-revision',
        ref: index === 0 ? 'base-revision' : 'variant-revision',
        fingerprint: index === 0 ? HASH_A : HASH_B,
      },
      buildTarget: {
        sourceRevision: index === 0 ? 'base-revision' : 'variant-revision',
        sourceFingerprint: index === 0 ? HASH_A : HASH_B,
        buildRecipeFingerprint: HASH_C,
        buildCommands: [
          { command: 'pnpm', args: ['--filter', '@neko/app-tui', 'build'], timeoutMs: 600000 },
        ],
        executablePath: 'apps/neko-tui/dist/main.js',
        launchCommand: { command: 'node', args: ['{executable}'] },
      },
      expectedPath: ['isolated worktree', 'isolated TUI build', 'TUI debug automation'],
      forbiddenFallback: [
        'working-tree executable',
        '__ablation marker',
        'direct AgentSession runner',
      ],
    })),
  };
}

function selection(rubricRef) {
  return {
    suite: {
      id: 'agent-runtime.single-message-tui',
      judgeProfiles: rubricRef ? [{ id: 'quality-judge' }] : [],
    },
    scenario: {
      id: 'canonical-answer',
      ...(rubricRef
        ? {
            rubric: {
              kind: 'domain-rubric',
              ref: rubricRef,
              judgeProfileId: 'quality-judge',
            },
          }
        : {}),
    },
    rubrics: rubricRef ? { [rubricRef]: { id: 'quality-rubric' } } : {},
  };
}

describe('ablation authoring contracts', () => {
  it('accepts focused configuration and implementation plans', () => {
    expect(validateAblationPlan(configurationPlan())).toEqual(configurationPlan());
    expect(validateAblationPlan(implementationPlan())).toEqual(implementationPlan());
  });

  it('rejects mixed unrelated dimensions without interaction evidence', () => {
    const plan = configurationPlan();
    plan.variants[1].changes = ['runtime.thinking-budget', 'runtime.temperature'];
    expect(() => validateAblationPlan(plan)).toThrow('multiple dimensions');
  });

  it('rejects unbounded or Cartesian matrices', () => {
    const unbounded = configurationPlan();
    unbounded.matrix.maxVariants = 21;
    expect(() => validateAblationPlan(unbounded)).toThrow('does not match any supported variant');

    const cartesian = configurationPlan();
    cartesian.matrix.strategy = 'cartesian';
    expect(() => validateAblationPlan(cartesian)).toThrow('does not match any supported variant');
  });

  it('rejects eval-only runtime flags and unsupported configuration dimensions', () => {
    const flag = configurationPlan();
    flag.variants[1].runtimeFlags = { __ablation: true };
    expect(() => validateAblationPlan(flag)).toThrow('unknown field');

    const unsupported = configurationPlan();
    unsupported.variants[1].changes = ['runtime.skill-injection'];
    expect(() => validateAblationPlan(unsupported)).toThrow('does not match any supported variant');
  });

  it('rejects missing effective configuration or external build evidence', () => {
    const configuration = configurationPlan();
    delete configuration.variants[1].expectedConfiguration;
    expect(() => validateAblationPlan(configuration)).toThrow(
      'does not match any supported variant',
    );

    const implementation = implementationPlan();
    delete implementation.variants[1].buildTarget;
    expect(() => validateAblationPlan(implementation)).toThrow(
      'does not match any supported variant',
    );
  });

  it('requires stable Host identity, distinct fingerprints, and no Market version fields', () => {
    const sameFingerprint = implementationPlan();
    sameFingerprint.variants[1].skillIdentity.fingerprint = HASH_A;
    expect(() => validateAblationPlan(sameFingerprint)).toThrow('must be unique');

    const renamed = implementationPlan();
    renamed.variants[1].skillIdentity.relativePath = 'renamed-storyboard';
    expect(() => validateAblationPlan(renamed)).toThrow('name must match relativePath');

    const marketVersion = implementationPlan();
    marketVersion.variants[1].marketVersion = '1.0.0';
    expect(() => validateAblationPlan(marketVersion)).toThrow('unknown field');
  });

  it('rejects duplicate non-baseline Skill fingerprints', () => {
    const value = implementationPlan();
    const duplicate = {
      ...value.variants[1],
      id: 'second-candidate',
      skillIdentity: { ...value.variants[1].skillIdentity },
      developmentCheckpoint: { ...value.variants[1].developmentCheckpoint, ref: 'second' },
    };
    value.variants.push(duplicate);
    expect(() => validateAblationPlan(value)).toThrow(
      'implementation Skill package fingerprints must be unique',
    );
  });

  it('requires ablation quality policy to match the selected scenario rubric', () => {
    const gatesOnly = configurationPlan();
    expect(validateAblationQualityContract(gatesOnly, selection())).toEqual(gatesOnly);
    expect(() =>
      validateAblationQualityContract(gatesOnly, selection('rubrics/storyboard-quality.json')),
    ).toThrow('hard-gates-only quality cannot select scenario rubric');

    const judged = implementationPlan();
    expect(
      validateAblationQualityContract(judged, selection('rubrics/storyboard-quality.json')),
    ).toEqual(judged);
    expect(() => validateAblationQualityContract(judged, selection())).toThrow(
      'is not enabled by scenario',
    );
    expect(() =>
      validateAblationQualityContract(judged, selection('rubrics/other-quality.json')),
    ).toThrow('does not match scenario rubric');
  });
});
