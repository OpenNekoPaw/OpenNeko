import { setTimeout as delay } from 'node:timers/promises';

export async function executeDesktopAgentWorkflow(input) {
  const receipts = new Map();
  const steps = [];
  let terminalIdle;
  let conversationId = input.conversationId;
  for (const step of input.steps) {
    const receipt = await executeStep({
      ...input,
      conversationId,
      step,
      receipts,
      defaultTimeoutMs: input.defaultTimeoutMs,
    });
    if (conversationId === undefined && typeof receipt?.conversationId === 'string') {
      conversationId = receipt.conversationId;
    }
    receipts.set(step.id, deepFreeze(receipt));
    steps.push(
      deepFreeze(
        await createWorkflowStepEvidence({
          driver: input.driver,
          conversationId,
          defaultTimeoutMs: input.defaultTimeoutMs,
          step,
          receipt,
        }),
      ),
    );
    if (step.kind === 'wait-for-idle') terminalIdle = receipt;
    input.checkpoint?.(`agent-workflow-${step.kind}`, checkpointDetail(step, receipt));
  }
  if (!terminalIdle?.identity) {
    throw configurationError('Desktop Agent workflow did not produce terminal idle identity.');
  }
  if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
    throw configurationError('Desktop Agent workflow did not establish a Conversation identity.');
  }
  return deepFreeze({
    conversationId,
    terminalIdle,
    receipts: Object.fromEntries(receipts),
    steps,
  });
}

async function executeStep(input) {
  const { driver, conversationId, step, receipts } = input;
  switch (step.kind) {
    case 'submit':
      if (step.delayMs) await (input.delay ?? delay)(step.delayMs);
      return driver.submit({
        ...(conversationId === undefined ? {} : { conversationId }),
        prompt: step.prompt,
        ...(step.contextPayloads ? { contextPayloads: step.contextPayloads } : {}),
      });
    case 'queue':
      requireReceipt(receipts, step.afterStepId, step);
      return driver.queue({
        conversationId: requireConversationId(conversationId),
        prompt: step.prompt,
      });
    case 'wait-for-idle':
      return driver.waitForIdle(requireConversationId(conversationId), step.timeoutMs);
    case 'cancel': {
      const referenced = requireSubmissionReceipt(receipts, step.afterStepId, step);
      const identity = await driver.waitForIdentity(
        requireConversationId(conversationId),
        referenced.eventOffset,
        input.defaultTimeoutMs,
      );
      return driver.cancel(identity);
    }
    case 'confirm': {
      const referenced = requireSubmissionReceipt(receipts, step.afterStepId, step);
      const pending = await driver.waitForPendingTool(
        requireConversationId(conversationId),
        step.toolName,
        referenced.eventOffset,
        step.timeoutMs,
      );
      return driver.confirm({ ...pending, approved: step.approved });
    }
    case 'resume':
      return driver.resume({
        conversationId: requireConversationId(conversationId),
        timeoutMs: input.defaultTimeoutMs,
      });
    case 'restart':
      return driver.restart({
        conversationId: requireConversationId(conversationId),
        timeoutMs: input.defaultTimeoutMs,
      });
    case 'feedback': {
      requireReceipt(receipts, step.afterStepId, step);
      const resumed = await driver.resume({
        conversationId: requireConversationId(conversationId),
        timeoutMs: input.defaultTimeoutMs,
      });
      const lastAssistant = readLastAssistant(resumed.snapshot);
      return driver.submit({
        conversationId: requireConversationId(conversationId),
        prompt: step.prompt.replaceAll('${lastAssistant}', lastAssistant),
      });
    }
    default:
      throw configurationError(
        `Desktop Agent workflow operation '${step.kind}' reached the interpreter without support.`,
      );
  }
}

function requireConversationId(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw configurationError('Desktop Agent workflow operation requires a Conversation identity.');
  }
  return value;
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

async function createWorkflowStepEvidence(input) {
  const observation =
    typeof input.driver.observeWorkflowStep === 'function' && typeof input.conversationId === 'string'
      ? await input.driver.observeWorkflowStep({
          conversationId: input.conversationId,
          afterEventOffset: input.receipt?.eventOffset,
          timeoutMs: input.defaultTimeoutMs,
        })
      : undefined;
  return {
    id: input.step.id,
    kind: input.step.kind,
    method: workflowMethod(input.step.kind),
    ...(input.receipt?.accepted === undefined ? {} : { accepted: input.receipt.accepted }),
    ...(input.step.kind === 'queue' ? { queued: observation?.queued === true } : {}),
    ...(observation === undefined ? {} : { snapshot: observation }),
  };
}

function workflowMethod(kind) {
  switch (kind) {
    case 'submit':
    case 'queue':
    case 'feedback':
      return 'message.submit';
    case 'wait-for-idle':
      return 'session.waitForIdle';
    case 'cancel':
      return 'message.cancel';
    case 'confirm':
      return 'tool.confirm';
    case 'resume':
    case 'restart':
      return 'session.resume';
    default:
      throw configurationError(`Desktop Agent workflow step '${kind}' has no evidence method.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}
