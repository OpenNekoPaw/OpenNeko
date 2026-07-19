import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { validateAuthoringDecision } from '../schemas/contracts.mjs';

const coverageIndex = JSON.parse(
  readFileSync(new URL('../suites/coverage-index.json', import.meta.url), 'utf8'),
);
const runtimeSuiteIds = new Map(
  coverageIndex.targets
    .filter(
      (target) =>
        target.kind === 'agent-runtime-capability' &&
        target.disposition === 'suite' &&
        Array.isArray(target.suiteIds),
    )
    .map((target) => [target.id, Object.freeze([...target.suiteIds])]),
);

const RULES = Object.freeze([
  rule('evaluation-platform', 'agent-runtime.evaluation-platform', [
    'scripts/agent-eval/',
    '.codex/skills/neko-agent-evaluation/',
  ]),
  rule('tool-result-delivery', 'agent-runtime.stream-delivery', [
    'packages/neko-content/src/document/read-document-tool.ts',
    'packages/neko-agent/packages/agent/src/pi/event-projector.ts',
    'packages/neko-agent/packages/extension/src/chat/message/piAgentStreamProcessor.ts',
    'apps/neko-tui/src/tui/adapters/pi-event-adapter.ts',
  ]),
  rule('tui-debug-facts', 'agent-runtime.single-message-tui', [
    'apps/neko-tui/src/tui/core/debug-automation/',
  ]),
  regexRule(
    'portable-skill-content',
    (match) => `skill.${match[1]}`,
    /^(?:\.codex|\.agents)\/skills\/([a-z0-9][a-z0-9._-]*)\//u,
  ),
  rule('prompt-composition', 'agent-runtime.prompt-composition', [
    'packages/neko-agent/packages/agent/src/prompt/',
  ]),
  rule('skill-runtime', 'agent-runtime.skill-runtime', [
    'packages/neko-agent/packages/agent/src/skill/',
    'packages/neko-agent/packages/platform/src/skill/',
    'packages/neko-skills/src/builtins/',
  ]),
  rule('capability-tool-routing', 'agent-runtime.perception-routing', [
    'packages/neko-agent/packages/agent/src/tools/',
    'packages/neko-agent/packages/extension/src/tools/',
    'packages/neko-agent/packages/platform/src/capability/',
    'packages/neko-agent/packages/platform/src/service/shared-service-adapter.ts',
    'packages/neko-agent/packages/agent-types/src/capability',
  ]),
  rule('provider-model-routing', 'agent-runtime.model-binding', [
    'packages/neko-agent/packages/agent/src/provider/',
    'packages/neko-agent/packages/platform/src/llm/',
    'packages/neko-agent/packages/platform/src/config/',
    'packages/neko-agent/packages/ai-sdk/src/',
  ]),
  rule('session-workflows', 'agent-runtime.workflow-controller', [
    'packages/neko-agent/packages/agent/src/session/',
    'packages/neko-agent/packages/agent/src/subagent/',
    'apps/neko-tui/src/tui/hooks/useAgentSession',
    'apps/neko-tui/src/tui/runtime/',
    'apps/neko-tui/src/tui/core/message-queue-',
    'apps/neko-tui/src/tui/presentation/session-control-',
    'apps/neko-tui/src/tui/presentation/work-queue-',
  ]),
  rule('task-recovery', 'agent-runtime.workflow-controller', [
    'packages/neko-agent/packages/agent/src/task/',
    'packages/neko-agent/packages/agent/src/runtime/continuation',
    'packages/neko-agent/packages/agent-types/src/agent-message-queue',
    'apps/neko-tui/src/tui/core/tui-media-background-tasks',
    'apps/neko-tui/src/tui/host/node-media-task-delivery-host',
  ]),
  rule('creative-media-workflow', 'agent-runtime.creative-media-workflow', [
    'packages/neko-agent/packages/platform/src/media/',
  ]),
  rule('tui-event-projection', 'agent-runtime.stream-delivery', [
    'apps/neko-tui/src/tui/core/timeline-',
    'apps/neko-tui/src/tui/markdown/',
    'apps/neko-tui/src/tui/core/markdown',
  ]),
  rule('tui-debug-facts', 'agent-runtime.single-message-tui', [
    'apps/neko-tui/src/main.ts',
    'apps/neko-tui/src/application.ts',
    'apps/neko-tui/package.json',
    'apps/neko-tui/tsup.config.ts',
    'apps/neko-tui/src/tui/',
  ]),
]);

export function selectEvaluationCoverage(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    throw new Error('changedPaths must contain at least one behavior-affecting path');
  }
  const selected = new Map();
  const unmapped = [];
  for (const rawPath of changedPaths) {
    const path = normalizeRepositoryPath(rawPath);
    const match = RULES.find((candidate) => candidate.matches(path));
    if (!match) {
      unmapped.push(path);
      continue;
    }
    const suiteId = match.suiteId(path);
    const suiteIds = readOwningSuiteIds(match.behaviorId, suiteId);
    if (!suiteIds.includes(suiteId)) {
      throw new Error(
        `coverage-index mismatch: ${match.behaviorId} does not own primary suite ${suiteId}`,
      );
    }
    const key = `${match.behaviorId}:${suiteId}`;
    const existing = selected.get(key);
    selected.set(key, {
      behaviorId: match.behaviorId,
      suiteId,
      suiteIds,
      changedPaths: [...(existing?.changedPaths ?? []), path],
    });
  }
  if (unmapped.length > 0) {
    throw new Error(`unmapped-coverage: ${unmapped.join(', ')}`);
  }
  return [...selected.values()].sort((left, right) =>
    `${left.behaviorId}:${left.suiteId}`.localeCompare(`${right.behaviorId}:${right.suiteId}`),
  );
}

export function isAgentEvaluationRelevantPath(rawPath) {
  const path = normalizeRepositoryPath(rawPath);
  return (
    path.startsWith('.codex/skills/') ||
    path.startsWith('.agents/skills/') ||
    path.startsWith('packages/neko-skills/src/builtins/') ||
    path.startsWith('packages/neko-agent/packages/agent/src/') ||
    path.startsWith('packages/neko-agent/packages/ai-sdk/src/') ||
    path.startsWith('apps/neko-tui/') ||
    path.startsWith('packages/neko-agent/packages/extension/src/tools/') ||
    path.startsWith('packages/neko-agent/packages/platform/src/') ||
    path === 'packages/neko-content/src/document/read-document-tool.ts' ||
    path.startsWith('scripts/agent-eval/')
  );
}

export function validateAuthoringCoverage(changedPaths, decisions) {
  const selections = selectEvaluationCoverage(changedPaths);
  if (!Array.isArray(decisions)) throw new Error('authoring decisions must be an array');
  decisions.forEach(validateAuthoringDecision);
  for (const selection of selections) {
    const matches = decisions.filter((decision) => decision.behaviorId === selection.behaviorId);
    if (matches.length !== 1) {
      throw new Error(
        `behavior ${selection.behaviorId} requires exactly one Evaluation decision; observed ${matches.length}`,
      );
    }
    const decision = matches[0];
    const declaredSuiteId = decision.suiteId ?? decision.proposedSuiteId;
    if (decision.decision !== 'excluded' && declaredSuiteId !== selection.suiteId) {
      throw new Error(
        `behavior ${selection.behaviorId} must use selected suite ${selection.suiteId}; received ${declaredSuiteId}`,
      );
    }
  }
  const selectedBehaviors = new Set(selections.map((selection) => selection.behaviorId));
  const unrelated = decisions.filter((decision) => !selectedBehaviors.has(decision.behaviorId));
  if (unrelated.length > 0) {
    throw new Error(
      `authoring decisions contain behavior(s) not selected by changed paths: ${unrelated.map((item) => item.behaviorId).join(', ')}`,
    );
  }
  return { selections, decisions };
}

function rule(behaviorId, suiteId, prefixes) {
  return {
    behaviorId,
    matches: (path) => prefixes.some((prefix) => path.startsWith(prefix)),
    suiteId: () => suiteId,
  };
}

function regexRule(behaviorId, suiteId, pattern) {
  return {
    behaviorId,
    matches: (path) => pattern.test(path),
    suiteId: (path) => {
      const match = path.match(pattern);
      if (!match) throw new Error(`internal selector mismatch for ${path}`);
      return suiteId(match);
    },
  };
}

function normalizeRepositoryPath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('changed path must be a non-empty repository-relative string');
  }
  const path = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (path.startsWith('/') || /^[A-Za-z]:\//u.test(path)) {
    throw new Error(`changed path must be repository-relative: ${value}`);
  }
  if (path.split('/').some((segment) => segment === '..')) {
    throw new Error(`changed path must not traverse outside the repository: ${value}`);
  }
  return path;
}

function readOwningSuiteIds(behaviorId, primarySuiteId) {
  if (behaviorId === 'portable-skill-content' || behaviorId === 'evaluation-platform') {
    return [primarySuiteId];
  }
  const suiteIds = runtimeSuiteIds.get(behaviorId);
  if (!suiteIds) {
    throw new Error(`coverage-index mismatch: missing suite ownership for ${behaviorId}`);
  }
  return suiteIds;
}
