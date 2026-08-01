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
  rule('timeline-projection-authority', 'agent-runtime.stream-delivery', [
    'packages/neko-agent-types/src/agent-turn-timeline.ts',
    'packages/neko-agent-types/src/conversation-projection.ts',
    'packages/neko-agent-runtime/src/pi/timeline-projector.ts',
    'packages/neko-agent-runtime/src/runtime/projection/',
    'packages/neko-agent-runtime/src/runtime/index.ts',
    'packages/neko-agent-runtime/src/runtime/turn/message-runtime.ts',
    'packages/neko-agent-runtime/src/runtime/turn/multimodal-context-packet.ts',
    'packages/neko-agent-runtime/src/runtime/turn/timeline-context-runtime.ts',
    'packages/neko-agent-runtime/src/runtime/__tests__/message-runtime.test.ts',
    'packages/neko-agent-runtime/src/runtime/__tests__/multimodal-context-packet.test.ts',
    'packages/neko-agent-runtime/src/runtime/__tests__/timeline-context-runtime.test.ts',
    'packages/neko-agent-webview/src/handlers/legacy-active-content-handlers.ts',
    'packages/neko-agent-webview/src/presenters/conversation-projection-presenter.ts',
    'packages/neko-agent-webview/src/presenters/timeline-projection-presenter.ts',
    'packages/neko-agent-webview/src/render-runtime/',
  ]),
  rule('tool-result-delivery', 'agent-runtime.stream-delivery', [
    'packages/neko-content/src/document/read-document-tool.ts',
    'packages/neko-content/src/document/read-image-tool.ts',
    'packages/neko-agent-runtime/src/pi/event-projector.ts',
    'apps/neko-desktop/src/main/desktop-agent-bridge-runtime.ts',
  ]),
  rule('resource-display-projection', 'agent-runtime.stream-delivery', [
    'packages/neko-agent-runtime/src/input/message-resource-projector.ts',
    'packages/neko-agent-webview/src/presenters/resource-display-uri.ts',
    'packages/neko-agent-webview/src/components/ChatView/MediaPreview/',
    'apps/neko-desktop/src/main/desktop-agent-resource-display-projector.ts',
  ]),
  regexRule(
    'portable-skill-content',
    (match) => `skill.${match[1]}`,
    /^(?:\.codex|\.agents)\/skills\/([a-z0-9][a-z0-9._-]*)\//u,
  ),
  rule('prompt-composition', 'agent-runtime.prompt-composition', [
    'packages/neko-agent-runtime/src/prompt/',
  ]),
  rule('skill-runtime', 'agent-runtime.skill-runtime', [
    'packages/neko-agent-runtime/src/skill/',
    'packages/neko-platform/src/skill/',
    'packages/neko-skills/src/builtins/',
  ]),
  rule('capability-tool-routing', 'agent-runtime.perception-routing', [
    'packages/neko-quality/src/',
    'packages/neko-agent-runtime/src/tools/',
    'packages/neko-agent-runtime/src/runtime/capability/capability-runtime-bindings.ts',
    'packages/neko-platform/src/capability/',
    'packages/neko-platform/src/service/shared-service-adapter.ts',
    'packages/neko-agent-types/src/capability',
  ]),
  rule('provider-model-routing', 'agent-runtime.model-binding', [
    'packages/neko-agent-runtime/src/provider/',
    'packages/neko-platform/src/llm/',
    'packages/neko-platform/src/config/',
    'packages/neko-ai-sdk/src/',
  ]),
  rule('session-workflows', 'agent-runtime.workflow-controller', [
    'packages/neko-agent-runtime/src/session/',
    'packages/neko-agent-runtime/src/subagent/',
    'apps/neko-desktop/src/main/desktop-agent-app-host-composition',
    'apps/neko-desktop/src/main/desktop-agent-controller-composition',
    'apps/neko-desktop/src/renderer/DesktopAgentSurface',
  ]),
  rule('tool-call-lifecycle', 'agent-runtime.workflow-controller', [
    'packages/neko-agent-runtime/src/task/',
    'packages/neko-agent-runtime/src/runtime/continuation',
    'packages/neko-agent-runtime/src/runtime/session/execution-ownership',
    'packages/neko-agent-types/src/agent-message-queue',
    'packages/neko-platform/src/media/media-agent-tools',
    'packages/neko-platform/src/media/media-generation-executor',
    'packages/neko-platform/src/media/media-turn-dispatcher',
    'apps/neko-desktop/src/main/desktop-canvas-generation-runtime',
  ]),
  rule('creative-media-workflow', 'agent-runtime.creative-media-workflow', [
    'packages/neko-platform/src/media/',
  ]),
  rule('desktop-event-projection', 'agent-runtime.stream-delivery', [
    'apps/neko-desktop/src/preload/desktop-agent-event-cursor',
    'apps/neko-desktop/src/renderer/desktop-agent-host-runtime-adapter',
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
    path.startsWith('packages/neko-agent-runtime/src/') ||
    path.startsWith('packages/neko-agent-types/src/') ||
    path.startsWith('packages/neko-ai-sdk/src/') ||
    path.startsWith('apps/neko-desktop/src/main/desktop-agent') ||
    path.startsWith('apps/neko-desktop/src/preload/desktop-agent') ||
    path.startsWith('apps/neko-desktop/src/renderer/DesktopAgent') ||
    path.startsWith('apps/neko-desktop/src/renderer/desktop-agent') ||
    path.startsWith('packages/neko-agent-webview/src/') ||
    path.startsWith('packages/neko-platform/src/') ||
    path === 'packages/neko-content/src/document/read-document-tool.ts' ||
    path === 'packages/neko-content/src/document/read-image-tool.ts' ||
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
