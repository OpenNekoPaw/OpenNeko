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
      modelProfiles: input.modelProfiles ?? [],
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
        ...resolveModelOverride(step, input.modelProfiles),
      });
    case 'wait-for-idle': {
      const idle = await driver.waitForIdle(requireConversationId(conversationId), step.timeoutMs);
      if (typeof driver.readFacts !== 'function') return idle;
      const observed = await driver.readFacts(idle.identity);
      if (observed?.status !== 'facts' || !observed.facts) {
        throw configurationError(`Desktop Agent workflow idle step '${step.id}' has no facts.`);
      }
      return { ...idle, facts: observed.facts };
    }
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
    case 'update-configuration': {
      return driver.updateConfiguration({
        conversationId: requireConversationId(conversationId),
        providerId: step.providerId,
        modelId: step.modelId,
        expectedStatus: step.expectedStatus,
        turnState: step.turnState,
        timeoutMs: step.timeoutMs,
      });
    }
    case 'invoke-input':
      return driver.invokeInput({
        conversationId: requireConversationId(conversationId),
        trigger: step.trigger,
        name: step.name,
        ...(step.args === undefined ? {} : { args: step.args }),
        ...(step.resultEvent === undefined ? {} : { resultEvent: step.resultEvent }),
        timeoutMs: step.timeoutMs,
      });
    default:
      throw configurationError(
        `Desktop Agent workflow operation '${step.kind}' reached the interpreter without support.`,
      );
  }
}

function resolveModelOverride(step, profiles) {
  if (step.modelProfileId === undefined) return {};
  const profile = profiles.find((candidate) => candidate.id === step.modelProfileId);
  if (!profile) {
    throw configurationError(
      `Desktop Agent workflow model profile '${step.modelProfileId}' is unavailable.`,
    );
  }
  if (profile.selection === 'configured-default') return {};
  return {
    chatModel: {
      providerId: profile.chat.providerId,
      modelId: profile.chat.modelId,
      category: 'llm',
      ...(profile.chat.providerExpressionProfileId === undefined
        ? {}
        : { providerExpressionProfileId: profile.chat.providerExpressionProfileId }),
    },
  };
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
    input.deferObservation !== true &&
    typeof input.driver.observeWorkflowStep === 'function' &&
    typeof input.conversationId === 'string'
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
    ...(input.receipt?.facts === undefined ? {} : { facts: input.receipt.facts }),
    ...(input.receipt?.status === undefined ? {} : { status: input.receipt.status }),
    ...(observation === undefined ? {} : { snapshot: observation }),
  };
}

function workflowMethod(kind) {
  switch (kind) {
    case 'submit':
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
    case 'invoke-input':
      return 'agent-input.invoke';
    case 'update-configuration':
      return 'conversation.configuration.update';
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
