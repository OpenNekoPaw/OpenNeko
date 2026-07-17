import { runTuiWorkflowController } from './workflow-controller.mjs';

const TERMINAL_RESIZE_SETTLE_MS = 50;

export async function runSingleMessageTuiDriver(child, responses, input) {
  const steps = [{ id: 'submit', kind: 'submit', prompt: input.prompt }];
  if (input.cancelAfterMs !== undefined) {
    steps.push({
      id: 'cancel',
      kind: 'cancel',
      afterStepId: 'submit',
      delayMs: input.cancelAfterMs,
    });
  }
  steps.push({
    id: 'idle',
    kind: 'wait-for-idle',
    timeoutMs: input.timeoutMs ?? 120_000,
  });
  const facts = await runTuiWorkflowController(child, responses, {
    sessionParams: input.sessionParams,
    steps,
    includeHistory: input.includeHistory,
    captureStepFacts: false,
    includeTrace: input.cancelAfterMs !== undefined,
    terminalResizes: input.terminalResizes,
    resizeSettleMs: TERMINAL_RESIZE_SETTLE_MS,
  });
  if (input.cancelAfterMs === undefined) return facts;
  const { automation, ...rawFacts } = facts;
  const cancellation = automation.steps.find((step) => step.kind === 'cancel');
  return {
    ...rawFacts,
    automation: {
      messageCancellation: { accepted: cancellation?.accepted === true },
    },
  };
}
