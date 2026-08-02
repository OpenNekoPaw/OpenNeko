const DRIVER_STATE_KEY = '__openNekoDesktopAgentDriverV1';

export function createDesktopAgentDriver(input) {
  if (typeof input?.evaluate !== 'function') {
    throw driverError('Desktop Agent driver requires a CDP renderer evaluate function');
  }
  const evaluate = (command) => input.evaluate(driverExpression(command));
  return Object.freeze({
    async connect(identity) {
      return evaluate({ kind: 'connect', identity });
    },
    async createConversation(timeoutMs = 10_000) {
      return evaluate({ kind: 'create-conversation', timeoutMs });
    },
    async submit(command) {
      return evaluate({ kind: 'submit', ...command });
    },
    async queue(command) {
      return evaluate({ kind: 'queue', ...command });
    },
    async cancel(identity) {
      return evaluate({ kind: 'cancel', identity });
    },
    async confirm(command) {
      return evaluate({ kind: 'confirm', ...command });
    },
    async resume(command) {
      return evaluate({ kind: 'resume', ...command });
    },
    async readProjection(conversationId) {
      return evaluate({ kind: 'read-projection', conversationId });
    },
    async waitForIdle(conversationId, timeoutMs) {
      return evaluate({ kind: 'wait-for-idle', conversationId, timeoutMs });
    },
    async readFacts(identity) {
      return evaluate({ kind: 'read-facts', identity });
    },
    async reloadRenderer() {
      return evaluate({ kind: 'reload-renderer' });
    },
    async closeApplication() {
      return evaluate({ kind: 'close-application' });
    },
    async dispose() {
      return evaluate({ kind: 'dispose' });
    },
  });
}

export function driverExpression(command) {
  const serialized = JSON.stringify(command);
  return `(async (command) => {
    const stateKey = ${JSON.stringify(DRIVER_STATE_KEY)};
    const bridge = window.openNekoDesktop?.agent;
    if (!bridge) throw new Error('Desktop public Agent bridge is unavailable.');
    const requireText = (value, label) => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(label + ' is required.');
      }
      return value;
    };
    const requireState = () => {
      const state = globalThis[stateKey];
      if (!state?.connection || typeof state.unsubscribe !== 'function') {
        throw new Error('Desktop Agent driver is not connected.');
      }
      return state;
    };
    const requireAutomation = () => {
      if (!bridge.automation || typeof bridge.automation.execute !== 'function') {
        throw new Error('Desktop Agent fixture automation bridge is unavailable.');
      }
      return bridge.automation;
    };
    const collectIdentity = (state, value) => {
      if (!value || typeof value !== 'object') return;
      if (
        typeof value.conversationId === 'string' &&
        typeof value.turnId === 'string' &&
        typeof value.runId === 'string'
      ) {
        state.identities.add(value.conversationId + '\\u0000' + value.turnId + '\\u0000' + value.runId);
      }
      if (Array.isArray(value)) {
        for (const item of value) collectIdentity(state, item);
        return;
      }
      for (const item of Object.values(value)) collectIdentity(state, item);
    };
    const assertObservedIdentity = (state, identity) => {
      const key =
        requireText(identity?.conversationId, 'Conversation identity') + '\\u0000' +
        requireText(identity?.turnId, 'turn identity') + '\\u0000' +
        requireText(identity?.runId, 'run identity');
      if (!state.identities.has(key)) {
        throw new Error('Desktop Agent operation identity was not observed from the public projection.');
      }
    };
    switch (command.kind) {
      case 'connect': {
        globalThis[stateKey]?.unsubscribe?.();
        const identity = command.identity;
        const bootstrap = await bridge.getBootstrap(
          requireText(identity?.projectId, 'Project identity'),
          requireText(identity?.viewId, 'View identity'),
          identity?.viewEpoch,
        );
        if (bootstrap.status !== 'ready') {
          throw new Error(bootstrap.diagnostic?.message ?? 'Desktop Agent bootstrap is unavailable.');
        }
        const state = { connection: bootstrap.connection, events: [], identities: new Set() };
        state.unsubscribe = bridge.subscribe((message) => {
          state.events.push(message);
          collectIdentity(state, message);
        });
        globalThis[stateKey] = state;
        return { connection: bootstrap.connection };
      }
      case 'submit':
      case 'queue': {
        requireState();
        bridge.send({
          type: 'sendMessage',
          conversationId: requireText(command.conversationId, 'Conversation identity'),
          message: requireText(command.prompt, 'Agent prompt'),
          sessionMode: 'agent',
          ...(Array.isArray(command.contextPayloads)
            ? { contextPayloads: command.contextPayloads }
            : {}),
          ...(command.chatModel ? { chatModel: command.chatModel } : {}),
          ...(command.llmConfig ? { llmConfig: command.llmConfig } : {}),
        });
        return { accepted: true };
      }
      case 'create-conversation': {
        const state = requireState();
        const eventOffset = state.events.length;
        bridge.send({ type: 'newConversation' });
        const deadline = Date.now() + (Number.isFinite(command.timeoutMs) ? command.timeoutMs : 10000);
        while (Date.now() < deadline) {
          const created = state.events.slice(eventOffset).find(
            (event) => event?.type === 'activeConversation' &&
              typeof event?.conversation?.id === 'string' &&
              event.conversation.id.length > 0,
          );
          if (created) return { conversationId: created.conversation.id };
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error('Desktop Agent conversation creation did not publish an active conversation.');
      }
      case 'cancel': {
        const state = requireState();
        assertObservedIdentity(state, command.identity);
        bridge.send({ type: 'cancelMessage', conversationId: command.identity.conversationId });
        return { accepted: true };
      }
      case 'confirm': {
        const state = requireState();
        assertObservedIdentity(state, command);
        bridge.send({
          type: 'confirmTool',
          conversationId: command.conversationId,
          toolCallId: requireText(command.toolCallId, 'Tool Call identity'),
          approved: command.approved === true,
        });
        return { accepted: true };
      }
      case 'resume': {
        requireState();
        bridge.send({
          type: 'getConversationSnapshot',
          conversationId: requireText(command.conversationId, 'Conversation identity'),
        });
        return { accepted: true };
      }
      case 'read-projection': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const events = state.events.filter(
          (event) => event?.conversationId === conversationId || event?.conversation?.id === conversationId,
        );
        return { connection: state.connection, events };
      }
      case 'wait-for-idle': {
        requireState();
        return requireAutomation().execute({
          kind: 'wait-for-idle',
          conversationId: requireText(command.conversationId, 'Conversation identity'),
          timeoutMs: command.timeoutMs,
        });
      }
      case 'read-facts': {
        const state = requireState();
        assertObservedIdentity(state, command.identity);
        return requireAutomation().execute({ kind: 'read-facts', ...command.identity });
      }
      case 'reload-renderer':
        requireState();
        return requireAutomation().execute({ kind: 'reload-renderer' });
      case 'close-application':
        requireState();
        return requireAutomation().execute({ kind: 'close-application' });
      case 'dispose': {
        const state = globalThis[stateKey];
        state?.unsubscribe?.();
        delete globalThis[stateKey];
        return { disposed: true };
      }
      default:
        throw new Error('Unsupported Desktop Agent driver operation.');
    }
  })(${serialized})`;
}

function driverError(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}
