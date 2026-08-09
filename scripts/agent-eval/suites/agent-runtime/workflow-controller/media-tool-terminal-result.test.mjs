import { describe, expect, it } from 'vitest';
import { discoverSuites, selectSuiteCases } from '../../discovery.mjs';

describe('media-tool-terminal-result scenario', () => {
  it('approves both GenerateImage calls and keeps the missing-binding turn on its exact profile', async () => {
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
      'missing-binding',
      'confirm-missing-binding',
      'failure-idle',
    ]);
    expect(steps[1]).toMatchObject({
      kind: 'confirm',
      afterStepId: 'generate',
      toolName: 'GenerateImage',
      approved: true,
    });
    expect(steps[3]).toMatchObject({
      kind: 'submit',
      modelProfileId: 'nekoapi-chat-without-image-generation',
    });
    expect(steps[4]).toMatchObject({
      kind: 'confirm',
      afterStepId: 'missing-binding',
      toolName: 'GenerateImage',
      approved: true,
    });
    expect(selection.scenario.modelProfileIds).toEqual(['configured-default']);
    const generateAssertion = selection.scenario.assertions.find(
      (assertion) => assertion.id === 'generate-image',
    );
    expect(generateAssertion?.resultIncludes).toEqual({
      jobKind: 'generation',
      jobLifecycleOwner: 'generation-job-coordinator',
    });
    expect(generateAssertion?.resultIncludes).not.toHaveProperty('success');
    expect(generateAssertion?.resultIncludes).not.toHaveProperty('data');
    expect(
      selection.scenario.assertions.find(
        (assertion) => assertion.id === 'missing-binding-fails',
      ),
    ).toMatchObject({
      kind: 'tool-call',
      name: 'GenerateImage',
      status: 'error',
    });
  });
});
