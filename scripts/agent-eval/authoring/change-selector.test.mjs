import { describe, expect, it } from 'vitest';
import { CASE_GROUPS, SCHEMAS } from '../schemas/contracts.mjs';
import {
  isAgentEvaluationRelevantPath,
  selectEvaluationCoverage,
  validateAuthoringCoverage,
} from './change-selector.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function decision(behaviorId, suiteId) {
  return {
    schema: SCHEMAS.authoringDecision,
    behaviorId,
    decision: 'update',
    suiteId,
    target: { kind: 'runtime', id: behaviorId, contractHash: HASH },
    userBehavior: `Exercise ${behaviorId} through the canonical Agent path.`,
    evidenceContract: {
      userBehavior: `Exercise ${behaviorId} through the canonical Agent path.`,
      canonicalPath: ['Desktop App', 'sender-bound DSH bridge', 'ACP Session runtime'],
      observables: [
        {
          ref: 'runtime-facts',
          kind: 'runtime-fact',
          description: 'Typed canonical runtime facts.',
          required: true,
        },
      ],
      expectedResult: 'The selected behavior completes.',
      expectedFailure: 'Missing path evidence fails visibly.',
    },
    coverageDelta: {
      schema: SCHEMAS.coverageDelta,
      behaviorId,
      groups: CASE_GROUPS.map((group) =>
        group === 'canonical'
          ? { group, disposition: 'required' }
          : { group, disposition: 'not-applicable', reason: `${group} is outside this change.` },
      ),
    },
  };
}

describe('Agent Evaluation change-to-suite selector', () => {
  it('maps known Prompt, Skill, Tool, model, session, lifecycle, facts, and platform paths', () => {
    expect(
      selectEvaluationCoverage([
        '.codex/skills/storyboard/SKILL.md',
        'packages/agent/runtime/src/prompt/system-prompt.ts',
        'packages/agent/runtime/src/tools/read-image-tool.ts',
        'packages/automation/node/src/index.ts',
        'packages/agent/runtime/src/runtime/capability/capability-runtime-bindings.ts',
        'packages/host/src/settings/config-manager.ts',
        'packages/agent/runtime/src/application/conversation-dsh-session-application.ts',
        'packages/agent/runtime/src/session/agent-session.ts',
        'packages/agent/runtime/src/subagent/task-tool.ts',
        'packages/agent/runtime/src/acp/dsh-acp-application-client.ts',
        'packages/generation/src/media/media-generation-executor.ts',
        'packages/generation/src/media/generated-output-adoption.ts',
        'packages/content/src/document/read-document-tool.ts',
        'packages/content/src/document/read-image-tool.ts',
        'packages/agent/runtime/src/acp/dsh-acp-projection.ts',
        'packages/agent/runtime/src/acp/dsh-acp-projection.ts',
        'packages/agent/runtime/src/runtime/turn/multimodal-context-packet.ts',
        'packages/agent/runtime/src/runtime/capability/capability-runtime-bindings.ts',
        'packages/agent/runtime/src/acp/dsh-acp-projection.ts',
        'packages/agent/contracts/src/dsh-session-host.ts',
        'apps/neko-desktop/src/main/desktop-dsh-session-host.ts',
        'packages/agent/runtime/src/input/message-resource-projector.ts',
        'apps/neko-desktop/src/main/desktop-dsh-agent-runtime.ts',
        'apps/neko-desktop/src/preload/dsh-session-bridge.test.ts',
        'scripts/agent-eval/schemas/contracts.mjs',
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          behaviorId: 'portable-skill-content',
          suiteId: 'skill.storyboard',
        }),
        expect.objectContaining({
          behaviorId: 'prompt-composition',
          suiteId: 'agent-runtime.prompt-composition',
        }),
        expect.objectContaining({
          behaviorId: 'capability-tool-routing',
          suiteId: 'agent-runtime.external-automation',
          changedPaths: ['packages/automation/node/src/index.ts'],
        }),
        expect.objectContaining({
          behaviorId: 'capability-tool-routing',
          suiteId: 'agent-runtime.perception-routing',
        }),
        expect.objectContaining({
          behaviorId: 'provider-model-routing',
          suiteId: 'agent-runtime.model-binding',
        }),
        expect.objectContaining({
          behaviorId: 'launch-domain-binding',
          suiteId: 'agent-runtime.launch-binding',
          suiteIds: ['agent-runtime.launch-binding', 'agent-runtime.skill-runtime'],
        }),
        expect.objectContaining({
          behaviorId: 'session-workflows',
          suiteId: 'agent-runtime.workflow-controller',
          suiteIds: ['agent-runtime.workflow-controller'],
        }),
        expect.objectContaining({
          behaviorId: 'tool-call-lifecycle',
          suiteId: 'agent-runtime.workflow-controller',
          suiteIds: [
            'agent-runtime.external-automation',
            'agent-runtime.workflow-controller',
            'agent-runtime.stream-delivery',
            'agent-runtime.creative-media-workflow',
          ],
        }),
        expect.objectContaining({
          behaviorId: 'creative-media-workflow',
          suiteId: 'agent-runtime.creative-media-workflow',
          suiteIds: ['agent-runtime.creative-media-workflow'],
        }),
        expect.objectContaining({
          behaviorId: 'tool-result-delivery',
          suiteId: 'agent-runtime.stream-delivery',
          suiteIds: ['agent-runtime.external-automation', 'agent-runtime.stream-delivery'],
        }),
        expect.objectContaining({
          behaviorId: 'timeline-projection-authority',
          suiteId: 'agent-runtime.stream-delivery',
          suiteIds: ['agent-runtime.stream-delivery'],
        }),
        expect.objectContaining({
          behaviorId: 'desktop-event-projection',
          suiteId: 'agent-runtime.stream-delivery',
          suiteIds: ['agent-runtime.external-automation', 'agent-runtime.stream-delivery'],
        }),
        expect.objectContaining({
          behaviorId: 'resource-display-projection',
          suiteId: 'agent-runtime.stream-delivery',
          suiteIds: ['agent-runtime.stream-delivery'],
        }),
        expect.objectContaining({
          behaviorId: 'evaluation-platform',
          suiteId: 'agent-runtime.evaluation-platform',
        }),
      ]),
    );
  });

  it('maps Desktop DSH composition files to the owning runtime suite', () => {
    const paths = [
      'packages/agent/runtime/src/application/conversation-dsh-session-application.ts',
      'apps/neko-desktop/src/main/desktop-dsh-agent-runtime.ts',
      'apps/neko-desktop/src/main/desktop-dsh-permission-host.ts',
      'apps/neko-desktop/src/renderer/DesktopAgentSurface.tsx',
    ];
    expect(paths.every(isAgentEvaluationRelevantPath)).toBe(true);
    expect(selectEvaluationCoverage(paths)).toEqual(
      expect.arrayContaining([
        {
          behaviorId: 'launch-domain-binding',
          suiteId: 'agent-runtime.launch-binding',
          suiteIds: ['agent-runtime.launch-binding', 'agent-runtime.skill-runtime'],
          changedPaths: [
            'packages/agent/runtime/src/application/conversation-dsh-session-application.ts',
          ],
        },
        {
          behaviorId: 'session-workflows',
          suiteId: 'agent-runtime.workflow-controller',
          suiteIds: ['agent-runtime.workflow-controller'],
          changedPaths: [
            'apps/neko-desktop/src/main/desktop-dsh-agent-runtime.ts',
            'apps/neko-desktop/src/main/desktop-dsh-permission-host.ts',
            'apps/neko-desktop/src/renderer/DesktopAgentSurface.tsx',
          ],
        },
      ]),
    );
  });

  it('maps Desktop DSH projection consumers to existing workflow and stream suites', () => {
    const paths = [
      'apps/neko-desktop/src/renderer/DesktopAgentSurface.tsx',
      'apps/neko-desktop/src/preload/dsh-session-bridge.test.ts',
      'apps/neko-desktop/src/preload/dsh-permission-bridge.test.ts',
    ];
    expect(paths.every(isAgentEvaluationRelevantPath)).toBe(true);
    expect(selectEvaluationCoverage(paths)).toEqual([
      {
        behaviorId: 'desktop-event-projection',
        suiteId: 'agent-runtime.stream-delivery',
        suiteIds: ['agent-runtime.external-automation', 'agent-runtime.stream-delivery'],
        changedPaths: [
          'apps/neko-desktop/src/preload/dsh-session-bridge.test.ts',
          'apps/neko-desktop/src/preload/dsh-permission-bridge.test.ts',
        ],
      },
      {
        behaviorId: 'session-workflows',
        suiteId: 'agent-runtime.workflow-controller',
        suiteIds: ['agent-runtime.workflow-controller'],
        changedPaths: ['apps/neko-desktop/src/renderer/DesktopAgentSurface.tsx'],
      },
    ]);
  });

  it('maps the Cut DSH Tool vertical slice to creative media workflow coverage', () => {
    const paths = [
      'packages/cut/domain/src/dsh-tool.ts',
      'packages/cut/dsh-plugin/src/index.ts',
      'packages/agent/runtime/src/acp/cut-host-adapter.ts',
      'apps/neko-desktop/src/main/desktop-dsh-domain-tool-handlers.ts',
    ];
    expect(paths.every(isAgentEvaluationRelevantPath)).toBe(true);
    expect(selectEvaluationCoverage(paths)).toEqual([
      {
        behaviorId: 'creative-media-workflow',
        suiteId: 'agent-runtime.creative-media-workflow',
        suiteIds: ['agent-runtime.creative-media-workflow'],
        changedPaths: paths,
      },
    ]);
  });

  it('maps canonical builtin Skill content without a retired Pi execution fixture', () => {
    const paths = ['packages/skills/skills/character-creator/SKILL.md'];
    expect(paths.every(isAgentEvaluationRelevantPath)).toBe(true);
    expect(selectEvaluationCoverage(paths)).toEqual([
      {
        behaviorId: 'portable-skill-content',
        suiteId: 'skill.character-creator',
        suiteIds: ['skill.character-creator'],
        changedPaths: ['packages/skills/skills/character-creator/SKILL.md'],
      },
    ]);
  });

  it('maps external automation packages and Desktop boundaries to their exact suite', () => {
    const paths = [
      'packages/automation/contracts/src/index.ts',
      'packages/agent/runtime/src/extensions/automation-capability-adapter.ts',
      'apps/neko-desktop/src/main/desktop-browser-use-mcp-client-factory.ts',
      'apps/neko-desktop/src/main/desktop-cua-driver-mcp-client-factory.ts',
      'apps/neko-desktop/src/renderer/desktop-automation-target-selection-runtime.ts',
      'apps/neko-desktop/src/shared/automation-target-selection-contract.ts',
    ];
    expect(paths.every(isAgentEvaluationRelevantPath)).toBe(true);
    expect(selectEvaluationCoverage(paths)).toEqual([
      {
        behaviorId: 'capability-tool-routing',
        suiteId: 'agent-runtime.external-automation',
        suiteIds: [
          'agent-runtime.external-automation',
          'agent-runtime.perception-routing',
          'skill.skill-creator',
          'skill.image',
          'skill.video',
        ],
        changedPaths: paths,
      },
    ]);
  });

  it('deduplicates files owned by the same behavior and suite', () => {
    expect(
      selectEvaluationCoverage([
        'packages/agent/runtime/src/session/agent-session.ts',
        'packages/agent/runtime/src/session/conversation-control-runtime.ts',
      ]),
    ).toEqual([
      {
        behaviorId: 'session-workflows',
        suiteId: 'agent-runtime.workflow-controller',
        suiteIds: ['agent-runtime.workflow-controller'],
        changedPaths: [
          'packages/agent/runtime/src/session/agent-session.ts',
          'packages/agent/runtime/src/session/conversation-control-runtime.ts',
        ],
      },
    ]);
  });

  it('fails unknown behavior paths instead of selecting a default suite', () => {
    expect(() =>
      selectEvaluationCoverage(['packages/agent/runtime/src/unknown/new-runtime.ts']),
    ).toThrow('unmapped-coverage');
  });

  it('requires exactly one reviewed decision for each selected behavior', () => {
    const paths = ['packages/agent/runtime/src/session/agent-session.ts'];
    const valid = decision('session-workflows', 'agent-runtime.workflow-controller');
    expect(validateAuthoringCoverage(paths, [valid]).selections).toHaveLength(1);
    expect(() => validateAuthoringCoverage(paths, [])).toThrow('exactly one Evaluation decision');
    expect(() => validateAuthoringCoverage(paths, [valid, valid])).toThrow(
      'exactly one Evaluation decision',
    );
    expect(() =>
      validateAuthoringCoverage(paths, [decision('session-workflows', 'agent-runtime.default')]),
    ).toThrow('must use selected suite agent-runtime.workflow-controller');
  });
});
