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
      canonicalPath: ['TUI App', 'input queue', 'AgentSession'],
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
  it('maps known Prompt, Skill, Tool, model, session, task, facts, and platform paths', () => {
    expect(
      selectEvaluationCoverage([
        '.codex/skills/storyboard/SKILL.md',
        'packages/neko-agent/packages/agent/src/prompt/system-prompt.ts',
        'packages/neko-agent/packages/extension/src/tools/readImageTool.ts',
        'packages/neko-agent/packages/platform/src/service/shared-service-adapter.ts',
        'packages/neko-agent/packages/platform/src/llm/adapter/openai-adapter.ts',
        'packages/neko-agent/packages/agent/src/session/agent-session.ts',
        'packages/neko-agent/packages/agent/src/subagent/task-tool.ts',
        'packages/neko-agent/packages/agent/src/task/task-runtime.ts',
        'packages/neko-agent/packages/platform/src/media/media-task-executor.ts',
        'packages/neko-content/src/document/read-document-tool.ts',
        'packages/neko-content/src/document/read-image-tool.ts',
        'packages/neko-agent/packages/agent/src/pi/event-projector.ts',
        'packages/neko-agent/packages/extension/src/chat/message/piAgentStreamProcessor.ts',
        'apps/neko-tui/src/tui/adapters/pi-event-adapter.ts',
        'apps/neko-tui/src/tui/core/tui-media-background-tasks.ts',
        'apps/neko-tui/src/tui/core/debug-automation/types.ts',
        'apps/neko-tui/src/tui/markdown/controller.ts',
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
          suiteIds: ['agent-runtime.single-message-tui', 'agent-runtime.workflow-controller'],
        }),
        expect.objectContaining({
          behaviorId: 'task-recovery',
          suiteId: 'agent-runtime.workflow-controller',
          suiteIds: ['agent-runtime.workflow-controller', 'agent-runtime.creative-media-workflow'],
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
          behaviorId: 'tui-debug-facts',
          suiteId: 'agent-runtime.single-message-tui',
          suiteIds: ['agent-runtime.single-message-tui', 'agent-runtime.workflow-controller'],
        }),
        expect.objectContaining({
          behaviorId: 'tui-event-projection',
          suiteId: 'agent-runtime.stream-delivery',
          suiteIds: ['agent-runtime.stream-delivery', 'agent-runtime.tui-markdown'],
        }),
        expect.objectContaining({
          behaviorId: 'evaluation-platform',
          suiteId: 'agent-runtime.evaluation-platform',
        }),
      ]),
    );
  });

  it('maps TUI application entry and build files to every owning runtime suite', () => {
    const paths = [
      'apps/neko-tui/src/main.ts',
      'apps/neko-tui/src/application.ts',
      'apps/neko-tui/package.json',
      'apps/neko-tui/tsup.config.ts',
    ];
    expect(paths.every(isAgentEvaluationRelevantPath)).toBe(true);
    expect(selectEvaluationCoverage(paths)).toEqual([
      {
        behaviorId: 'tui-debug-facts',
        suiteId: 'agent-runtime.single-message-tui',
        suiteIds: ['agent-runtime.single-message-tui', 'agent-runtime.workflow-controller'],
        changedPaths: paths,
      },
    ]);
  });

  it('deduplicates files owned by the same behavior and suite', () => {
    expect(
      selectEvaluationCoverage([
        'packages/neko-agent/packages/agent/src/session/agent-session.ts',
        'packages/neko-agent/packages/agent/src/session/conversation-control-runtime.ts',
      ]),
    ).toEqual([
      {
        behaviorId: 'session-workflows',
        suiteId: 'agent-runtime.workflow-controller',
        suiteIds: ['agent-runtime.single-message-tui', 'agent-runtime.workflow-controller'],
        changedPaths: [
          'packages/neko-agent/packages/agent/src/session/agent-session.ts',
          'packages/neko-agent/packages/agent/src/session/conversation-control-runtime.ts',
        ],
      },
    ]);
  });

  it('fails unknown behavior paths instead of selecting a default suite', () => {
    expect(() =>
      selectEvaluationCoverage(['packages/neko-agent/packages/agent/src/unknown/new-runtime.ts']),
    ).toThrow('unmapped-coverage');
  });

  it('requires exactly one reviewed decision for each selected behavior', () => {
    const paths = ['packages/neko-agent/packages/agent/src/session/agent-session.ts'];
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
