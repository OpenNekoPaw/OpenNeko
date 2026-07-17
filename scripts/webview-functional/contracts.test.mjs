import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCENARIO_SCHEMA_VERSION, validateScenario } from './contracts.mjs';

describe('webview functional scenario contract', () => {
  it('accepts a closed real-host scenario with authoritative and runtime assertions', () => {
    assert.equal(validateScenario(createScenario()).id, 'agent.p0.submit');
  });

  it('rejects arbitrary JavaScript and unknown operations before host launch', () => {
    assert.throws(
      () => validateScenario({ ...createScenario(), javascript: 'window.store.clear()' }),
      /unknown field.*javascript/u,
    );
    const scenario = createScenario();
    scenario.steps[0].operation = 'evaluate-javascript';
    assert.throws(() => validateScenario(scenario), /must be one of/u);
  });

  it('rejects CSS selectors without an audited reason', () => {
    const scenario = createScenario();
    scenario.steps[0].selector = { css: '.private-store-hook' };
    assert.throws(() => validateScenario(scenario), /auditedSelectorReason/u);
  });

  it('accepts an audited CSS selector narrowed by accessible name or text', () => {
    const scenario = createScenario();
    scenario.steps[0].selector = {
      css: '.agent-bubble-user',
      name: 'Functional host message',
      auditedSelectorReason: 'Message rows repeat, so the scenario narrows the stable class by text.',
    };
    assert.equal(
      validateScenario(scenario).steps[0].selector.name,
      'Functional host message',
    );
  });

  it('accepts a bounded declarative drag and rejects missing or empty deltas', () => {
    const scenario = createScenario();
    scenario.steps[0] = {
      id: 'drag-node',
      operation: 'drag',
      selector: { testId: 'canvas-node' },
      delta: { x: 80, y: -20 },
    };
    assert.deepEqual(validateScenario(scenario).steps[0].delta, { x: 80, y: -20 });

    delete scenario.steps[0].delta;
    assert.throws(() => validateScenario(scenario), /delta must be an object/u);
    scenario.steps[0].delta = { x: 0, y: 0 };
    assert.throws(() => validateScenario(scenario), /must move the pointer/u);
  });

  it('rejects target-only smoke as functional acceptance', () => {
    const scenario = createScenario();
    scenario.assertions = [
      { id: 'visible', kind: 'visible', selector: { testId: 'chat-input' } },
      { id: 'errors', kind: 'runtime-errors', expected: [] },
    ];
    assert.throws(() => validateScenario(scenario), /authoritative result assertion/u);
  });

  it('rejects fixture traversal', () => {
    const scenario = createScenario();
    scenario.fixture.workspace = '../outside';
    assert.throws(() => validateScenario(scenario), /must stay within/u);
  });

  it('requires Engine prerequisites to declare the expected runtime state', () => {
    const scenario = createScenario();
    scenario.prerequisites = [{ kind: 'engine' }];
    assert.throws(() => validateScenario(scenario), /prerequisites\[0\]\.state/u);

    scenario.prerequisites = [{ kind: 'engine', state: 'ready' }];
    assert.equal(validateScenario(scenario).prerequisites[0].state, 'ready');
  });

  it('accepts the generic Electron host without VS Code extensions', () => {
    const scenario = createScenario();
    scenario.ownerPackage = '@neko/app-home';
    scenario.host = 'electron';
    scenario.extensions = [];
    scenario.activation = { kind: 'launch' };
    scenario.target = { type: 'page', titleIncludes: 'OpenNeko Home' };

    assert.equal(validateScenario(scenario).host, 'electron');
  });

  it('accepts structured Engine command result assertions and rejects ambiguous sources', () => {
    const scenario = createScenario();
    scenario.assertions[0] = {
      id: 'engine-ready',
      kind: 'engine-result',
      stepId: 'wait-input',
      jsonPath: 'state',
      expected: 'ready',
    };
    assert.equal(validateScenario(scenario).assertions[0].stepId, 'wait-input');

    scenario.assertions[0].event = 'engine.ready';
    assert.throws(() => validateScenario(scenario), /exactly one of event or stepId/u);
  });

  it('accepts a source file plus public command activation and typed host diagnostics', () => {
    const scenario = createScenario();
    scenario.activation = {
      kind: 'open-file-command',
      path: 'story.fountain',
      command: 'neko.story.preview',
    };
    scenario.steps = [
      { id: 'read-story-diagnostics', operation: 'read-diagnostics', path: 'story.fountain' },
    ];
    scenario.assertions[0] = {
      id: 'story-diagnostic',
      kind: 'diagnostic',
      code: 'story.syntax.unclosed-note',
      stepId: 'read-story-diagnostics',
    };

    const validated = validateScenario(scenario);
    assert.equal(validated.activation.kind, 'open-file-command');
    assert.equal(validated.steps[0].operation, 'read-diagnostics');
    assert.equal(validated.assertions[0].stepId, 'read-story-diagnostics');
  });
});

function createScenario() {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'agent.p0.submit',
    title: 'Agent input reaches the real host session',
    ownerPackage: 'neko-agent',
    tier: 'p0',
    host: 'vscode',
    platforms: ['darwin', 'linux'],
    fixture: { workspace: 'scripts/webview-functional/fixtures/agent', digestFiles: [] },
    extensions: [{ id: 'neko.neko-agent', developmentPath: 'packages/neko-agent' }],
    prerequisites: [{ kind: 'package-script', package: 'neko-agent', script: 'compile' }],
    activation: { kind: 'command', command: 'workbench.view.extension.neko-assistant' },
    target: {
      type: 'iframe',
      extensionId: 'neko.neko-agent',
      viewType: 'neko.aiAssistant',
    },
    steps: [
      { id: 'wait-input', operation: 'wait-visible', selector: { testId: 'chat-input' } },
    ],
    assertions: [
      { id: 'host-message', kind: 'observation', event: 'agent.message.received' },
      { id: 'errors', kind: 'runtime-errors', expected: [] },
    ],
    errorPolicy: {
      knownBenignWarningIds: ['vscode-webview-local-network-access'],
      expectedDiagnosticCodes: [],
      failOnConsoleWarning: true,
    },
    evidence: { domSnapshot: true, screenshot: true, logs: true, sideEffects: true },
    timeoutMs: 60000,
    tags: ['agent'],
  };
}
