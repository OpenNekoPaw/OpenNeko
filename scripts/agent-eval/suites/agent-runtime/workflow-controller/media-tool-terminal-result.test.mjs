import { describe, expect, it } from 'vitest';
import { discoverSuites, selectSuiteCases } from '../../discovery.mjs';

describe('media-tool-terminal-result scenario', () => {
  it('approves GenerateImage before waiting for the generation turn to become idle', async () => {
    const [selection] = selectSuiteCases(await discoverSuites(), {
      suiteId: 'agent-runtime.workflow-controller',
      caseId: 'media-tool-terminal-result',
    });
    expect(selection).toBeDefined();
    const steps = selection.scenario.steps;

    expect(steps.map((step) => step.id)).toEqual([
      'generate',
      'confirm-generate-image',
      'idle',
    ]);
    expect(steps[1]).toMatchObject({
      kind: 'confirm',
      afterStepId: 'generate',
      toolName: 'GenerateImage',
      approved: true,
    });
    const generateAssertion = selection.scenario.assertions.find(
      (assertion) => assertion.id === 'generate-image',
    );
    expect(generateAssertion?.resultIncludes).toEqual({
      jobKind: 'generation',
      jobLifecycleOwner: 'generation-job-coordinator',
    });
    expect(generateAssertion?.resultIncludes).not.toHaveProperty('success');
    expect(generateAssertion?.resultIncludes).not.toHaveProperty('data');
  });
});
