import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAssertion } from './assertions.mjs';

describe('webview functional UI assertions', () => {
  it('supports asserting that an error surface is absent or hidden', async () => {
    const evaluations = [];
    const result = await runAssertion(
      { id: 'no-visible-error', kind: 'hidden', selector: { role: 'alert' } },
      {
        webview: {
          evaluate(expression) {
            evaluations.push(expression);
            return true;
          },
        },
      },
    );

    assert.equal(result.passed, true);
    assert.equal(evaluations.length, 1);
  });

  it('asserts a structured Engine result from public host-command step evidence', async () => {
    const result = await runAssertion(
      {
        id: 'engine-ready',
        kind: 'engine-result',
        stepId: 'read-engine-status',
        jsonPath: 'state',
        expected: 'ready',
      },
      {
        steps: [
          {
            id: 'read-engine-status',
            value: { state: 'ready', endpoint: { port: 43123 } },
          },
        ],
      },
    );

    assert.equal(result.passed, true);
    assert.equal(result.evidence.actual, 'ready');
  });

  it('asserts a typed diagnostic from public host step evidence', async () => {
    const result = await runAssertion(
      {
        id: 'unclosed-note',
        kind: 'diagnostic',
        code: 'story.syntax.unclosed-note',
        stepId: 'read-story-diagnostics',
      },
      {
        observations: [],
        runtimeClassification: { events: [] },
        steps: [
          {
            id: 'read-story-diagnostics',
            value: {
              diagnostics: [
                { code: 'story.syntax.unclosed-note', severity: 'error', message: 'Unclosed note' },
              ],
            },
          },
        ],
      },
    );

    assert.equal(result.passed, true);
    assert.equal(result.evidence.matchCount, 1);
  });
});
