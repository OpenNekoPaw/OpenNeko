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
      canonicalPath: ['Desktop App', 'sender-bound controller', 'Pi Conversation runtime'],
      forbiddenFallback: ['direct Agent runner'],
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
        'packages/agent/runtime/src/runtime/capability/capability-runtime-bindings.ts',
        'packages/host/src/settings/config-manager.ts',
        'packages/agent/runtime/src/session/agent-session.ts',
        'packages/agent/runtime/src/subagent/task-tool.ts',
        'packages/agent/runtime/src/runtime/session/execution-ownership.ts',
        'packages/generation/src/media/media-generation-executor.ts',
        'packages/generation/src/media/generated-output-adoption.ts',
        'packages/content/src/document/read-document-tool.ts',
        'packages/content/src/document/read-image-tool.ts',
        'packages/agent/runtime/src/pi/event-projector.ts',
        'packages/agent/runtime/src/pi/timeline-projector.ts',
        'packages/agent/runtime/src/runtime/turn/multimodal-context-packet.ts',
        'packages/agent/runtime/src/runtime/capability/capability-runtime-bindings.ts',
        'packages/agent/runtime/src/runtime/projection/conversation-projection-store.ts',
        'packages/agent/contracts/src/conversation-projection.ts',
        'packages/agent/webview/src/render-runtime/conversation-projection-replica.ts',
        'apps/neko-desktop/src/main/desktop-agent-bridge-runtime.ts',
        'packages/agent/runtime/src/runtime/projection/agent-resource-display-projector.ts',
        'packages/agent/runtime/src/input/message-resource-projector.ts',
        'packages/agent/webview/src/presenters/resource-display-uri.ts',
        'apps/neko-desktop/src/main/desktop-agent-controller-composition.ts',
        'apps/neko-desktop/src/preload/desktop-agent-event-cursor.ts',
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
          suiteId: 'agent-runtime.perception-routing',
        }),
        expect.objectContaining({
          behaviorId: 'provider-model-routing',
          suiteId: 'agent-runtime.model-binding',
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
          suiteIds: ['agent-runtime.stream-delivery'],
        }),
        expect.objectContaining({
          behaviorId: 'timeline-projection-authority',
          suiteId: 'agent-runtime.stream-delivery',
          suiteIds: ['agent-runtime.stream-delivery'],
        }),
        expect.objectContaining({
          behaviorId: 'desktop-event-projection',
          suiteId: 'agent-runtime.stream-delivery',
          suiteIds: ['agent-runtime.stream-delivery'],
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

  it('maps Desktop Agent composition files to the owning runtime suite', () => {
    const paths = [
      'apps/neko-desktop/src/main/desktop-agent-app-host-composition.ts',
      'apps/neko-desktop/src/main/desktop-agent-controller-composition.ts',
      'apps/neko-desktop/src/renderer/DesktopAgentSurface.tsx',
    ];
    expect(paths.every(isAgentEvaluationRelevantPath)).toBe(true);
    expect(selectEvaluationCoverage(paths)).toEqual([
      {
        behaviorId: 'session-workflows',
        suiteId: 'agent-runtime.workflow-controller',
        suiteIds: ['agent-runtime.workflow-controller'],
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
