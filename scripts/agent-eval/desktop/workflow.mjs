import { setTimeout as delay } from 'node:timers/promises';

export async function executeDesktopAgentWorkflow(input) {
  const receipts = new Map();
  let terminalIdle;
  for (const step of input.steps) {
    const receipt = await executeStep({
      ...input,
      step,
      receipts,
      defaultTimeoutMs: input.defaultTimeoutMs,
    });
    receipts.set(step.id, deepFreeze(receipt));
    if (step.kind === 'wait-for-idle') terminalIdle = receipt;
    input.checkpoint?.(`agent-workflow-${step.kind}`, checkpointDetail(step, receipt));
  }
  if (!terminalIdle?.identity) {
    throw configurationError('Desktop Agent workflow did not produce terminal idle identity.');
  }
  return deepFreeze({
    terminalIdle,
    receipts: Object.fromEntries(receipts),
  });
}

async function executeStep(input) {
  const { driver, conversationId, step, receipts } = input;
  switch (step.kind) {
    case 'submit':
      if (step.delayMs) await (input.delay ?? delay)(step.delayMs);
      return driver.submit({
        conversationId,
        prompt: step.prompt,
        ...(step.contextPayloads ? { contextPayloads: step.contextPayloads } : {}),
      });
    case 'queue':
      requireReceipt(receipts, step.afterStepId, step);
      return driver.queue({ conversationId, prompt: step.prompt });
    case 'wait-for-idle':
      return driver.waitForIdle(conversationId, step.timeoutMs);
    case 'cancel': {
      const referenced = requireSubmissionReceipt(receipts, step.afterStepId, step);
      const identity = await driver.waitForIdentity(
        conversationId,
        referenced.eventOffset,
        input.defaultTimeoutMs,
      );
      return driver.cancel(identity);
    }
    case 'confirm': {
      const referenced = requireSubmissionReceipt(receipts, step.afterStepId, step);
      const pending = await driver.waitForPendingTool(
        conversationId,
        step.toolName,
        referenced.eventOffset,
        step.timeoutMs,
      );
      return driver.confirm({ ...pending, approved: step.approved });
    }
    case 'resume':
      return driver.resume({ conversationId, timeoutMs: input.defaultTimeoutMs });
    case 'feedback': {
      requireReceipt(receipts, step.afterStepId, step);
      const resumed = await driver.resume({
        conversationId,
        timeoutMs: input.defaultTimeoutMs,
      });
      const lastAssistant = readLastAssistant(resumed.snapshot);
      return driver.submit({
        conversationId,
        prompt: step.prompt.replaceAll('${lastAssistant}', lastAssistant),
      });
    }
    default:
      throw configurationError(
        `Desktop Agent workflow operation '${step.kind}' reached the interpreter without support.`,
      );
  }
}

function requireReceipt(receipts, stepId, step) {
  const receipt = receipts.get(stepId);
  if (!receipt) {
    throw configurationError(
      `Desktop Agent workflow step '${step.id}' references missing receipt '${stepId}'.`,
    );
  }
  return receipt;
}

function requireSubmissionReceipt(receipts, stepId, step) {
  const receipt = requireReceipt(receipts, stepId, step);
  if (!Number.isInteger(receipt.eventOffset) || receipt.eventOffset < 0) {
    throw configurationError(
      `Desktop Agent workflow step '${step.id}' requires a submission event offset from '${stepId}'.`,
    );
  }
  return receipt;
}

function readLastAssistant(snapshot) {
  const assistant = snapshot?.messages
    ?.filter((message) => message?.role === 'assistant' && message.isError !== true)
    .at(-1);
  if (typeof assistant?.content !== 'string' || assistant.content.trim().length === 0) {
    throw new Error('Desktop Agent feedback requires a non-empty last assistant response.');
  }
  return assistant.content;
}

function checkpointDetail(step, receipt) {
  return {
    stepId: step.id,
    accepted: receipt?.accepted,
    identity: receipt?.identity,
    toolCallId: receipt?.toolCallId,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}
