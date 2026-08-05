const DRIVER_STATE_KEY = '__openNekoDesktopAgentDriverV1';

export function createDesktopAgentDriver(input) {
  if (typeof input?.evaluate !== 'function') {
    throw driverError('Desktop Agent driver requires a CDP renderer evaluate function');
  }
  const evaluate = (command) => input.evaluate(driverExpression(command));
  const operations = {
    async connect(identity) {
      return evaluate({ kind: 'connect', identity });
    },
    async createConversation(timeoutMs = 10_000) {
      return evaluate({ kind: 'create-conversation', timeoutMs });
    },
    async markEventOffset() {
      return evaluate({ kind: 'mark-event-offset' });
    },
    async waitForActiveConversation(afterEventOffset, timeoutMs) {
      return evaluate({ kind: 'wait-for-active-conversation', afterEventOffset, timeoutMs });
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
    async waitForIdentity(conversationId, afterEventOffset, timeoutMs) {
      return evaluate({
        kind: 'wait-for-identity',
        conversationId,
        afterEventOffset,
        timeoutMs,
      });
    },
    async waitForPendingTool(conversationId, toolName, afterEventOffset, timeoutMs) {
      return evaluate({
        kind: 'wait-for-pending-tool',
        conversationId,
        toolName,
        afterEventOffset,
        timeoutMs,
      });
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
  };
  return Object.freeze({
    ...operations,
    async reloadAndRestore(command) {
      const previous = requireConnection(command?.connection, 'reload');
      await operations.reloadRenderer();
      await requireLifecycle(input.waitForRenderer, 'renderer reload')();
      const connected = await operations.connect(previous);
      assertReloadIdentity(previous, connected.connection);
      const resumed = await operations.resume({
        conversationId: command.conversationId,
        timeoutMs: command.timeoutMs,
      });
      return Object.freeze({ connection: connected.connection, snapshot: resumed.snapshot });
    },
    async restartAndRestore(command) {
      const previous = requireConnection(command?.connection, 'application restart');
      await requireLifecycle(input.restartApplication, 'application restart')();
      await requireLifecycle(input.waitForRenderer, 'application restart readiness')();
      const connected = await operations.connect(previous);
      assertRestartIdentity(previous, connected.connection);
      const resumed = await operations.resume({
        conversationId: command.conversationId,
        timeoutMs: command.timeoutMs,
      });
      return Object.freeze({ connection: connected.connection, snapshot: resumed.snapshot });
    },
    async closeAndDispose() {
      const closed = await operations.closeApplication();
      if (closed?.status !== 'facts' || !closed.facts) {
        throw new Error('Desktop Agent close did not return final disposal facts.');
      }
      if (closed.facts.disposal?.status !== 'disposed') {
        throw new Error('Desktop Agent close returned incomplete disposal evidence.');
      }
      const local = await operations.dispose();
      return Object.freeze({ facts: closed.facts, local });
    },
  });
}

function requireLifecycle(operation, label) {
  if (typeof operation !== 'function') {
    throw driverError(`Desktop Agent ${label} lifecycle control is unavailable.`);
  }
  return operation;
}

function requireConnection(connection, label) {
  if (!connection || typeof connection !== 'object') {
    throw driverError(`Desktop Agent ${label} requires the prior connection identity.`);
  }
  return connection;
}

function assertReloadIdentity(previous, current) {
  if (
    !hasSameConnectionOwner(previous, current) ||
    current.applicationInstanceId !== previous.applicationInstanceId ||
    current?.connectionId === previous.connectionId
  ) {
    throw new Error('Desktop Agent renderer reload did not replace the exact owner connection.');
  }
}

function assertRestartIdentity(previous, current) {
  if (
    !hasSameConnectionOwner(previous, current) ||
    current?.applicationInstanceId === previous.applicationInstanceId ||
    current?.connectionId === previous.connectionId
  ) {
    throw new Error('Desktop Agent application restart identity did not restore exactly.');
  }
}

function hasSameConnectionOwner(previous, current) {
  const ownerKey = 'assistantSpaceId' in previous ? 'assistantSpaceId' : 'projectId';
  return (
    current !== undefined &&
    current !== null &&
    ownerKey in current &&
    current[ownerKey] === previous[ownerKey] &&
    current.windowId === previous.windowId &&
    current.workbenchInstanceId === previous.workbenchInstanceId &&
    current.agentSurfaceId === previous.agentSurfaceId &&
    current.workspaceId === previous.workspaceId &&
    current.viewId === previous.viewId
  );
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
    const findIdentity = (value, conversationId) => {
      if (!value || typeof value !== 'object') return undefined;
      if (
        value.conversationId === conversationId &&
        typeof value.turnId === 'string' && value.turnId.length > 0 &&
        typeof value.runId === 'string' && value.runId.length > 0
      ) {
        return {
          conversationId: value.conversationId,
          turnId: value.turnId,
          runId: value.runId,
        };
      }
      const values = Array.isArray(value) ? value : Object.values(value);
      for (const item of values) {
        const identity = findIdentity(item, conversationId);
        if (identity) return identity;
      }
      return undefined;
    };
    const assertNoAgentError = (value, conversationId) => {
      if (!value || typeof value !== 'object') return;
      if (
        (value.type === 'globalError' ||
          (value.type === 'error' && value.conversationId === conversationId)) &&
        typeof value.message === 'string' &&
        value.message.trim().length > 0
      ) {
        throw new Error('Desktop Agent public projection failed: ' + value.message);
      }
      const values = Array.isArray(value) ? value : Object.values(value);
      for (const item of values) assertNoAgentError(item, conversationId);
    };
    const findPendingTool = (value, conversationId, toolName) => {
      if (!value || typeof value !== 'object') return undefined;
      const toolCall = value.kind === 'tool_call' ? value.payload?.toolCall : undefined;
      if (
        value.conversationId === conversationId &&
        typeof value.turnId === 'string' && value.turnId.length > 0 &&
        typeof value.runId === 'string' && value.runId.length > 0 &&
        toolCall?.name === toolName &&
        toolCall.pendingConfirmation === true &&
        typeof toolCall.id === 'string' && toolCall.id.length > 0
      ) {
        return {
          conversationId: value.conversationId,
          turnId: value.turnId,
          runId: value.runId,
          toolCallId: toolCall.id,
          toolName,
        };
      }
      const values = Array.isArray(value) ? value : Object.values(value);
      for (const item of values) {
        const pending = findPendingTool(item, conversationId, toolName);
        if (pending) return pending;
      }
      return undefined;
    };
    const belongsToConversation = (value, conversationId) => {
      if (!value || typeof value !== 'object') return false;
      if (value.conversationId === conversationId || value.conversation?.id === conversationId) {
        return true;
      }
      const values = Array.isArray(value) ? value : Object.values(value);
      return values.some((item) => belongsToConversation(item, conversationId));
    };
    const isProjectionEvent = (value) => {
      if (!value || typeof value !== 'object') return false;
      if (
        value.type === 'projectionSnapshot' ||
        value.type === 'projectionPatch' ||
        value.type === 'conversationProjectionPatch'
      ) {
        return true;
      }
      const values = Array.isArray(value) ? value : Object.values(value);
      return values.some((item) => isProjectionEvent(item));
    };
    const waitForEvent = async (state, afterEventOffset, timeoutMs, select, failureMessage) => {
      const offset = Number.isInteger(afterEventOffset) && afterEventOffset >= 0
        ? afterEventOffset
        : state.events.length;
      const deadline = Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : 10000);
      while (Date.now() < deadline) {
        for (const event of state.events.slice(offset)) {
          const selected = select(event);
          if (selected) return selected;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(failureMessage);
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
    const assertTerminalIdentity = (state, identity) => {
      const key =
        requireText(identity?.conversationId, 'Conversation identity') + '\\u0000' +
        requireText(identity?.turnId, 'turn identity') + '\\u0000' +
        requireText(identity?.runId, 'run identity');
      if (!state.terminalIdentities.has(key)) {
        throw new Error('Desktop Agent facts identity was not observed at terminal idle.');
      }
    };
    switch (command.kind) {
      case 'connect': {
        globalThis[stateKey]?.unsubscribe?.();
        const identity = command.identity;
        const bootstrap = await bridge.getBootstrap(
          requireText(identity?.workbenchInstanceId, 'Workbench instance identity'),
          requireText(identity?.agentSurfaceId, 'Agent Surface identity'),
          requireText(identity?.projectId, 'Project identity'),
          requireText(identity?.viewId, 'View identity'),
        );
        if (bootstrap.status !== 'ready') {
          throw new Error(bootstrap.diagnostic?.message ?? 'Desktop Agent bootstrap is unavailable.');
        }
        const state = {
          connection: bootstrap.connection,
          events: [],
          identities: new Set(),
          terminalIdentities: new Set(),
          terminalIdentityByConversation: new Map(),
        };
        state.unsubscribe = bridge.subscribe(bootstrap.connection, (message) => {
          state.events.push(message);
          collectIdentity(state, message);
        });
        globalThis[stateKey] = state;
        return { connection: bootstrap.connection };
      }
      case 'submit':
      case 'queue': {
        const state = requireState();
        const eventOffset = state.events.length;
        bridge.send(state.connection, {
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
        return { accepted: true, eventOffset };
      }
      case 'create-conversation': {
        const state = requireState();
        const eventOffset = state.events.length;
        bridge.send(state.connection, { type: 'newConversation' });
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
      case 'mark-event-offset':
        return { eventOffset: requireState().events.length };
      case 'wait-for-active-conversation': {
        const state = requireState();
        return waitForEvent(
          state,
          command.afterEventOffset,
          command.timeoutMs,
          (event) => event?.type === 'activeConversation' &&
              typeof event?.conversation?.id === 'string' &&
              event.conversation.id.length > 0
            ? { conversationId: event.conversation.id }
            : undefined,
          'Desktop Agent UI submission did not publish an active conversation.',
        );
      }
      case 'cancel': {
        const state = requireState();
        assertObservedIdentity(state, command.identity);
        bridge.send(state.connection, {
          type: 'cancelMessage',
          conversationId: command.identity.conversationId,
        });
        return { accepted: true, identity: command.identity };
      }
      case 'confirm': {
        const state = requireState();
        assertObservedIdentity(state, command);
        bridge.send(state.connection, {
          type: 'confirmTool',
          conversationId: command.conversationId,
          toolCallId: requireText(command.toolCallId, 'Tool Call identity'),
          approved: command.approved === true,
        });
        return {
          accepted: true,
          identity: {
            conversationId: command.conversationId,
            turnId: command.turnId,
            runId: command.runId,
          },
          toolCallId: command.toolCallId,
        };
      }
      case 'resume': {
        const state = requireState();
        const eventOffset = state.events.length;
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        bridge.send(state.connection, {
          type: 'getConversationSnapshot',
          conversationId,
        });
        const snapshot = await waitForEvent(
          state,
          eventOffset,
          command.timeoutMs,
          (event) => event?.type === 'conversationSnapshot' && event?.conversation?.id === conversationId
            ? event.conversation
            : undefined,
          'Desktop Agent resume did not publish a conversation snapshot.',
        );
        return { accepted: true, eventOffset, snapshot };
      }
      case 'wait-for-identity': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const identity = await waitForEvent(
          state,
          command.afterEventOffset,
          command.timeoutMs,
          (event) => {
            assertNoAgentError(event, conversationId);
            return findIdentity(event, conversationId);
          },
          'Desktop Agent public projection did not publish a turn/run identity.',
        );
        return identity;
      }
      case 'wait-for-pending-tool': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const toolName = requireText(command.toolName, 'Tool name');
        return waitForEvent(
          state,
          command.afterEventOffset,
          command.timeoutMs,
          (event) => findPendingTool(event, conversationId, toolName),
          'Desktop Agent public projection did not publish the requested pending Tool confirmation.',
        );
      }
      case 'read-projection': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const events = state.events.filter(
          (event) => belongsToConversation(event, conversationId) && isProjectionEvent(event),
        );
        return { connection: state.connection, events };
      }
      case 'wait-for-idle': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const afterIdentity = state.terminalIdentityByConversation.get(conversationId);
        const result = await requireAutomation().execute(
          state.connection,
          {
            kind: 'wait-for-idle',
            conversationId,
            timeoutMs: command.timeoutMs,
            ...(afterIdentity ? { afterIdentity } : {}),
          },
        );
        if (result?.status !== 'idle' || !result.identity) {
          throw new Error('Desktop Agent idle observation did not return a terminal identity.');
        }
        state.terminalIdentities.add(
          result.identity.conversationId + '\\u0000' +
            result.identity.turnId + '\\u0000' +
            result.identity.runId,
        );
        state.terminalIdentityByConversation.set(conversationId, {
          turnId: result.identity.turnId,
          runId: result.identity.runId,
        });
        return result;
      }
      case 'read-facts': {
        const state = requireState();
        assertTerminalIdentity(state, command.identity);
        return requireAutomation().execute(state.connection, {
          kind: 'read-facts',
          ...command.identity,
        });
      }
      case 'reload-renderer': {
        const state = requireState();
        return requireAutomation().execute(state.connection, { kind: 'reload-renderer' });
      }
      case 'close-application': {
        const state = requireState();
        return requireAutomation().execute(state.connection, { kind: 'close-application' });
      }
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
