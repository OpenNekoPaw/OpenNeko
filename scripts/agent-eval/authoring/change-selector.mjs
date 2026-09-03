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
  rule('capability-tool-routing', 'agent-runtime.external-automation', [
    'packages/automation/',
    'packages/agent/runtime/src/extensions/automation-capability-adapter',
    'apps/neko-desktop/src/main/desktop-automation-',
    'apps/neko-desktop/src/main/desktop-browser-use-',
    'apps/neko-desktop/src/main/desktop-cua-driver-',
    'apps/neko-desktop/src/renderer/desktop-automation-',
    'apps/neko-desktop/src/shared/automation-target-selection-contract',
  ]),
  rule('timeline-projection-authority', 'agent-runtime.stream-delivery', [
    'packages/agent/runtime/src/acp/dsh-acp-projection',
    'packages/agent/contracts/src/dsh-session-host',
    'packages/agent/webview/src/dsh-session/',
    'packages/agent/webview/src/index.css',
  ]),
  rule('tool-result-delivery', 'agent-runtime.stream-delivery', [
    'packages/content/domain/src/document/read-document-tool.ts',
    'packages/content/domain/src/document/read-image-tool.ts',
    'packages/agent/runtime/src/acp/dsh-acp-projection',
    'packages/agent/runtime/src/input/message-resource-projector',
    'packages/agent/runtime/src/runtime/turn/multimodal-context-packet',
    'apps/neko-desktop/src/main/desktop-dsh-session-host',
  ]),
  rule('canvas-artifact-delivery', 'agent-runtime.workflow-controller', [
    'packages/agent/runtime/src/application/dsh-canvas-artifact-delivery',
    'apps/neko-desktop/src/main/desktop-dsh-canvas-artifact-delivery',
  ]),
  regexRule(
    'portable-skill-content',
    (match) => `skill.${match[1]}`,
    /^(?:(?:\.codex|\.agents)\/skills|packages\/skills\/skills)\/([a-z0-9][a-z0-9._-]*)\//u,
  ),
  rule('prompt-composition', 'agent-runtime.prompt-composition', [
    'packages/agent/runtime/src/prompt/',
    'packages/agent/runtime/src/application/dsh-conversation-turn-context',
    'packages/dsh-bridge/src/product-system-prompt',
  ]),
  rule('skill-runtime', 'agent-runtime.skill-runtime', [
    'packages/agent/runtime/src/skill/',
    'packages/dsh-bridge/src/skills/',
  ]),
  rule('screenplay-authoring', 'agent-runtime.screenplay-authoring', [
    'packages/agent/runtime/src/tools/core/file-access-policy',
    'packages/agent/runtime/src/tools/core/read-tool',
    'packages/agent/runtime/src/tools/core/write-tool',
    'packages/content/domain/src/node/workspace-content-writer',
    'packages/text-editor/domain/src/text-document-session',
  ]),
  rule('capability-tool-routing', 'agent-runtime.media-tool-routing', [
    'packages/agent/runtime/src/tools/',
    'packages/agent/runtime/src/runtime/capability/capability-runtime-bindings.ts',
    'packages/content/domain/src/image-dsh-tool',
    'packages/content/dsh-plugin/',
  ]),
  rule('provider-model-routing', 'agent-runtime.model-binding', [
    'packages/agent/runtime/src/provider/',
    'packages/dsh-bridge/src/',
    'packages/host/src/settings/',
    'packages/host/src/ai-model-settings',
    'packages/ai/sdk/src/',
    'packages/generation/domain/src/provider-capabilities',
    'apps/neko-desktop/src/main/desktop-dsh-provider-runtime',
    'apps/neko-desktop/src/main/desktop-dsh-provider-capability-projection',
    'apps/neko-desktop/src/renderer/DesktopSettingsSurface',
  ]),
  rule('creative-media-workflow', 'agent-runtime.creative-media-workflow', [
    'packages/chara/domain/src/application/character-dsh-tool',
    'packages/chara/node/src/character-dsh-host-adapter',
    'packages/chara/dsh-plugin/',
    'packages/world/domain/src/application/world-dsh-tool',
    'packages/world/dsh-plugin/',
    'packages/agent/runtime/src/acp/world-host-adapter',
    'packages/canvas/domain/src/dsh-tool',
    'packages/canvas/dsh-plugin/',
    'packages/agent/runtime/src/acp/canvas-host-adapter',
    'packages/agent/runtime/src/acp/dsh-domain-tool-handlers',
    'packages/cut/domain/src/dsh-tool',
    'packages/cut/dsh-plugin/',
    'packages/agent/runtime/src/acp/cut-host-adapter',
    'apps/neko-desktop/src/main/desktop-dsh-domain-tool-handlers',
    'apps/neko-desktop/src/main/desktop-dsh-product-handlers',
  ]),
  rule('launch-domain-binding', 'agent-runtime.launch-binding', [
    'packages/agent/contracts/src/agent-input-intent',
    'packages/agent/contracts/src/character-creation-handoff',
    'packages/agent/contracts/src/project-template-handoff',
    'packages/agent/contracts/src/world-creation-handoff',
    'packages/agent/contracts/src/agent-interaction-binding',
    'packages/agent/runtime/src/application/agent-domain-binding-service',
    'packages/agent/runtime/src/application/conversation-dsh-session-binding',
    'packages/agent/runtime/src/application/conversation-dsh-session-application',
  ]),
  rule('session-workflows', 'agent-runtime.workflow-controller', [
    'packages/agent/contracts/src/dsh-runtime-host',
    'packages/agent/runtime/src/session/',
    'packages/agent/runtime/src/subagent/',
    'packages/dsh-bridge/',
    'packages/agent/runtime/src/acp/dsh-acp-application-client',
    'packages/agent/runtime/src/application/conversation-dsh-session-client',
    'packages/agent/runtime/src/application/dsh-permission-owner',
    'apps/neko-desktop/src/main/desktop-dsh-agent-runtime',
    'apps/neko-desktop/src/main/desktop-dsh-composer-configuration',
    'apps/neko-desktop/src/main/desktop-dsh-runtime-host',
    'apps/neko-desktop/src/main/desktop-dsh-runtime-bootstrap',
    'apps/neko-desktop/src/main/desktop-dsh-permission-host',
    'apps/neko-desktop/src/renderer/DesktopAgentSurface',
  ]),
  rule('tool-call-lifecycle', 'agent-runtime.workflow-controller', [
    'packages/agent/runtime/src/task/',
    'packages/agent/runtime/src/runtime/continuation',
    'packages/agent/runtime/src/acp/dsh-acp-application-client',
    'packages/agent/contracts/src/agent-message-queue',
    'packages/agent/runtime/src/tools/generation/media-agent-tools',
    'packages/generation/domain/src/media/media-generation-executor',
    'packages/canvas/node/src/canvas-generation-node-runtime',
  ]),
  rule('creative-media-workflow', 'agent-runtime.creative-media-workflow', [
    'packages/generation/domain/src/media/',
  ]),
  rule('desktop-event-projection', 'agent-runtime.stream-delivery', [
    'packages/agent/contracts/src/dsh-session-host',
    'packages/agent/contracts/src/dsh-permission-host',
    'apps/neko-desktop/src/preload/dsh-session-bridge',
    'apps/neko-desktop/src/preload/dsh-permission-bridge',
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
    path.startsWith('packages/skills/skills/') ||
    path.startsWith('packages/agent/runtime/src/') ||
    path.startsWith('packages/agent/contracts/src/') ||
    path.startsWith('packages/dsh-bridge/') ||
    path.startsWith('packages/automation/') ||
    path.startsWith('packages/ai/sdk/src/') ||
    path.startsWith('packages/generation/domain/src/provider-capabilities') ||
    path.startsWith('apps/neko-desktop/src/main/desktop-agent') ||
    path.startsWith('apps/neko-desktop/src/main/desktop-dsh-') ||
    path.startsWith('apps/neko-desktop/src/main/desktop-automation-') ||
    path.startsWith('apps/neko-desktop/src/main/desktop-browser-use-') ||
    path.startsWith('apps/neko-desktop/src/main/desktop-cua-driver-') ||
    path.startsWith('apps/neko-desktop/src/preload/desktop-agent') ||
    path.startsWith('apps/neko-desktop/src/preload/dsh-') ||
    path.startsWith('apps/neko-desktop/src/renderer/DesktopAgent') ||
    path.startsWith('apps/neko-desktop/src/renderer/DesktopSettingsSurface') ||
    path.startsWith('apps/neko-desktop/src/renderer/desktop-agent') ||
    path.startsWith('apps/neko-desktop/src/renderer/desktop-automation-') ||
    path.startsWith('apps/neko-desktop/src/shared/automation-target-selection-contract') ||
    path.startsWith('packages/agent/webview/src/') ||
    path.startsWith('packages/host/src/settings/') ||
    path.startsWith('packages/host/src/ai-model-settings') ||
    path.startsWith('packages/cut/domain/src/dsh-tool') ||
    path.startsWith('packages/cut/dsh-plugin/') ||
    path.startsWith('packages/canvas/domain/src/dsh-tool') ||
    path.startsWith('packages/canvas/dsh-plugin/') ||
    path.startsWith('packages/chara/domain/src/application/character-dsh-tool') ||
    path.startsWith('packages/chara/node/src/character-dsh-host-adapter') ||
    path.startsWith('packages/chara/dsh-plugin/') ||
    path.startsWith('packages/world/domain/src/application/world-dsh-tool') ||
    path.startsWith('packages/world/dsh-plugin/') ||
    path === 'packages/content/domain/src/document/read-document-tool.ts' ||
    path === 'packages/content/domain/src/document/read-image-tool.ts' ||
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
