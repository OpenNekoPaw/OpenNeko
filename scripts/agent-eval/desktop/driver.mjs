const DRIVER_STATE_KEY = '__openNekoDesktopAgentDriverV1';
const DRAFT_DRIVER_STATE_KEY = '__openNekoDesktopAgentDraftDriver';

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
    async bindDraft(command) {
      return evaluate({ kind: 'draft-bind', ...command });
    },
    async submitDraft(command) {
      return evaluate({ kind: 'draft-submit', ...command });
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
    async invokeInput(command) {
      return evaluate({ kind: 'invoke-input', ...command });
    },
    async updateConfiguration(command) {
      return evaluate({ kind: 'update-configuration', ...command });
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
    async observeWorkflowStep(command) {
      return evaluate({ kind: 'observe-workflow-step', ...command });
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
    async prepareSessionAfterDraft() {
      const prepared = await evaluate({ kind: 'prepare-session-after-draft' });
      if (prepared?.reloading === true) {
        await requireLifecycle(input.waitForRenderer, 'Draft surface restoration')();
      }
      return prepared;
    },
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
    const draftStateKey = ${JSON.stringify(DRAFT_DRIVER_STATE_KEY)};
    const bridge = window.openNekoDesktop?.agent;
    if (!bridge) throw new Error('Desktop public Agent bridge is unavailable.');
    const launchBridge = window.openNekoDesktop?.agentLaunch;
    const shellBridge = window.openNekoDesktop?.shell;
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
    const readDraftSurface = async () => {
      if (!shellBridge || typeof shellBridge.getSnapshot !== 'function') {
        throw new Error('Desktop public Shell bridge is unavailable.');
      }
      const projection = await shellBridge.getSnapshot();
      const workbench = projection?.window?.workbench;
      const interaction = workbench?.scene?.slots?.interaction;
      const context = workbench?.scene?.context;
      if (!interaction || interaction.kind !== 'agent' || context?.kind !== 'agent') {
        throw new Error('Desktop Agent Draft surface is unavailable.');
      }
      const scope = context.scope;
      return {
        workbenchInstanceId: workbench.workbenchInstanceId,
        agentSurfaceId: interaction.agentSurfaceId,
        viewId: context.agentViewId,
        phase: interaction.phase,
        bindingKind: scope.kind,
        draftId: scope.draftId,
        ...(scope.conversationId === undefined ? {} : { conversationId: scope.conversationId }),
        scope,
      };
    };
    const projectDraft = (surface) => {
      const scope = surface.scope;
      const binding = scope.kind === 'unbound'
        ? { kind: 'unbound' }
        : scope.kind === 'assistant'
          ? { kind: 'assistant', assistantSpaceId: scope.assistantSpaceId, baseGrantIds: [] }
          : scope.kind === 'workspace'
            ? {
                kind: 'workspace',
                workspaceId: scope.workspaceId,
                workspaceGrantId: scope.workspaceGrantId,
              }
            : undefined;
      if (!binding || surface.phase !== 'draft') {
        throw new Error('Desktop Agent Draft harness requires an active supported Draft scope.');
      }
      return { phase: 'draft', draftId: surface.draftId, binding, bindingReceipt: null };
    };
    const requireDraftState = async () => {
      const existing = globalThis[draftStateKey];
      if (existing?.connection && existing.catalogs instanceof Map) return existing;
      if (!launchBridge || typeof launchBridge.attach !== 'function') {
        throw new Error('Desktop public Agent launch bridge is unavailable.');
      }
      const initialSurface = await readDraftSurface();
      const catalog = await launchBridge.attach(
        requireText(initialSurface.workbenchInstanceId, 'Workbench instance identity'),
        requireText(initialSurface.agentSurfaceId, 'Agent Surface identity'),
        requireText(initialSurface.viewId, 'Agent View identity'),
        projectDraft(initialSurface),
      );
      const state = {
        connection: catalog.connection,
        catalogs: new Map([['initial', catalog]]),
        currentCatalog: catalog,
        initialSurface,
      };
      globalThis[draftStateKey] = state;
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
    const hasTerminalCompletion = (value, identity) => {
      if (!value || typeof value !== 'object') return false;
      if (
        value.conversationId === identity.conversationId &&
        value.turnId === identity.turnId &&
        value.runId === identity.runId &&
        ['completed', 'failed', 'cancelled'].includes(value.completion?.status)
      ) {
        return true;
      }
      const values = Array.isArray(value) ? value : Object.values(value);
      return values.some((item) => hasTerminalCompletion(item, identity));
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
    const findMessageQueueSnapshot = (value, conversationId, type) => {
      if (!value || typeof value !== 'object') return undefined;
      if (
        (!type || value.type === type) &&
        value.snapshot?.conversationId === conversationId &&
        Number.isInteger(value.snapshot?.pendingCount) &&
        Number.isInteger(value.snapshot?.sequence)
      ) {
        return value.snapshot;
      }
      const values = Array.isArray(value) ? value : Object.values(value);
      for (const item of values) {
        const snapshot = findMessageQueueSnapshot(item, conversationId, type);
        if (snapshot) return snapshot;
      }
      return undefined;
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
      case 'draft-bind': {
        const state = await requireDraftState();
        if (command.target !== 'assistant') {
          throw new Error('Desktop Agent Draft binding target is unsupported.');
        }
        const catalog = await launchBridge.bindAssistant(state.connection);
        state.currentCatalog = catalog;
        state.catalogs.set(requireText(command.catalogRef, 'Draft catalog reference'), catalog);
        return {
          accepted: true,
          catalogRef: command.catalogRef,
          bindingKind: catalog.interaction.binding.kind,
          draftId: catalog.interaction.draftId,
          bindingReceiptId: catalog.interaction.bindingReceipt?.bindingReceiptId,
        };
      }
      case 'draft-submit': {
        const state = await requireDraftState();
        const catalogRef = requireText(command.catalogRef, 'Draft catalog reference');
        const catalog = state.catalogs.get(catalogRef);
        if (!catalog) throw new Error('Desktop Agent Draft catalog reference is unavailable.');
        if (command.expectedStatus !== 'rejected') {
          throw new Error('Desktop Agent Draft harness supports explicit rejection evidence only.');
        }
        const inputSpec = command.input;
        let selectedEntry;
        let intent;
        if (inputSpec?.kind === 'message') {
          intent = { kind: 'message', text: requireText(inputSpec.text, 'Draft message') };
        } else if (inputSpec?.kind === 'command' || inputSpec?.kind === 'skill') {
          const matches = catalog.inputs.filter(
            (entry) => entry?.trigger === inputSpec.kind && entry?.name === inputSpec.name,
          );
          if (matches.length !== 1) {
            throw new Error('Desktop Agent Draft input did not resolve one exact catalog entry.');
          }
          selectedEntry = matches[0];
          intent = inputSpec.kind === 'command'
            ? {
                kind: 'command',
                catalogEntryId: selectedEntry.id,
                commandId: selectedEntry.executable.commandId,
                handlerId: selectedEntry.executable.handlerId,
                ...(inputSpec.args === undefined ? {} : { args: inputSpec.args }),
              }
            : {
                kind: 'skill',
                catalogEntryId: selectedEntry.id,
                skillName: selectedEntry.executable.skillName,
                activationId: selectedEntry.executable.activationId,
                ...(inputSpec.args === undefined ? {} : { args: inputSpec.args }),
              };
        } else {
          throw new Error('Desktop Agent Draft input kind is unsupported.');
        }
        const configuration = catalog.configuration?.request;
        if (!configuration) throw new Error('Desktop Agent Draft configuration is unavailable.');
        const before = await readDraftSurface();
        let diagnosticMessage;
        try {
          await launchBridge.submitDraft(state.connection, {
            draft: catalog.interaction,
            input: intent,
            references: [],
            resourceGrantIds: [],
            configuration,
          });
        } catch (error) {
          diagnosticMessage = error instanceof Error ? error.message : String(error);
        }
        if (!diagnosticMessage) {
          throw new Error('Desktop Agent Draft submission unexpectedly materialized a Session.');
        }
        const after = await readDraftSurface();
        return {
          accepted: false,
          status: 'rejected',
          catalogRef,
          diagnosticMessage,
          initialBindingKind: state.catalogs.get('initial').interaction.binding.kind,
          currentBindingKind: state.currentCatalog.interaction.binding.kind,
          surfaceBefore: before,
          surfaceAfter: after,
          conversationCreated:
            before.phase === 'session' ||
            after.phase === 'session' ||
            typeof before.conversationId === 'string' ||
            typeof after.conversationId === 'string',
          ...(selectedEntry === undefined
            ? {}
            : {
                catalogEntryId: selectedEntry.id,
                availability: selectedEntry.availability,
              }),
        };
      }
      case 'prepare-session-after-draft': {
        const state = globalThis[draftStateKey];
        if (!state?.connection) return { reloading: false };
        await launchBridge.detach(state.connection);
        delete globalThis[draftStateKey];
        setTimeout(() => window.location.reload(), 0);
        return { reloading: true };
      }
      case 'connect': {
        globalThis[stateKey]?.unsubscribe?.();
        const identity = command.identity;
        const bootstrap = typeof identity?.assistantSpaceId === 'string'
          ? await bridge.getAssistantBootstrap(
              requireText(identity?.workbenchInstanceId, 'Workbench instance identity'),
              requireText(identity?.agentSurfaceId, 'Agent Surface identity'),
              requireText(identity.assistantSpaceId, 'Assistant Space identity'),
              requireText(identity?.conversationId, 'Conversation identity'),
              requireText(identity?.viewId, 'View identity'),
            )
          : await bridge.getBootstrap(
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
          submissionCount: 0,
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
        const submissionCount = state.submissionCount;
        state.submissionCount += 1;
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
        return { accepted: true, eventOffset, submissionCount };
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
      case 'invoke-input': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const eventOffset = state.events.length;
        bridge.send(state.connection, { type: 'getAgentInputCatalog', conversationId });
        const catalog = await waitForEvent(
          state,
          eventOffset,
          command.timeoutMs,
          (event) => event?.type === 'agentInputCatalog' && event?.conversationId === conversationId
            ? event
            : undefined,
          'Desktop Agent input catalog was not projected.',
        );
        const matches = catalog.entries.filter(
          (entry) => entry?.trigger === command.trigger && entry?.name === command.name,
        );
        if (matches.length !== 1 || matches[0]?.availability?.status !== 'available') {
          throw new Error('Desktop Agent input invocation did not resolve one available catalog entry.');
        }
        const entry = matches[0];
        const input = command.trigger === 'command'
          ? {
              kind: 'command',
              catalogEntryId: entry.id,
              commandId: entry.executable.commandId,
              handlerId: entry.executable.handlerId,
              ...(command.args === undefined ? {} : { args: command.args }),
            }
          : {
              kind: 'skill',
              catalogEntryId: entry.id,
              skillName: entry.executable.skillName,
              activationId: entry.executable.activationId,
              ...(command.args === undefined ? {} : { args: command.args }),
            };
        const invocationOffset = state.events.length;
        bridge.send(state.connection, { type: 'invokeAgentInput', conversationId, input });
        if (command.resultEvent === undefined) {
          return {
            accepted: true,
            eventOffset: invocationOffset,
            trigger: command.trigger,
            name: command.name,
            catalogEntryId: entry.id,
          };
        }
        const result = await waitForEvent(
          state,
          invocationOffset,
          command.timeoutMs,
          (event) => {
            if (event?.type === 'compressionError' && event?.conversationId === conversationId) {
              throw new Error(event.error ?? 'Desktop Agent input invocation failed.');
            }
            return event?.type === command.resultEvent && event?.conversationId === conversationId
              ? event
              : undefined;
          },
          'Desktop Agent input invocation did not publish its completion event.',
        );
        return {
          accepted: true,
          eventOffset: invocationOffset,
          trigger: command.trigger,
          name: command.name,
          catalogEntryId: entry.id,
          result,
        };
      }
      case 'update-configuration': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const providerId = requireText(command.providerId, 'Provider identity');
        const modelId = requireText(command.modelId, 'Model identity');
        const eventOffset = state.events.length;
        const submissionCountBefore = state.submissionCount;
        let turnStateAtUpdate;
        if (command.turnState === 'running') {
          assertObservedIdentity(state, command.runningTurnIdentity);
          if (state.events.some((event) => hasTerminalCompletion(event, command.runningTurnIdentity))) {
            throw new Error('Desktop Agent configuration update missed the running Turn boundary.');
          }
          turnStateAtUpdate = 'running';
        } else if (command.turnState === 'idle') {
          if (!state.terminalIdentityByConversation.has(conversationId)) {
            throw new Error('Desktop Agent configuration update requires observed terminal idle.');
          }
          turnStateAtUpdate = 'idle';
        } else {
          throw new Error('Desktop Agent configuration update Turn state is invalid.');
        }
        bridge.send(state.connection, {
          type: 'updateSettings',
          conversationId,
          settings: { providerId, modelId },
        });
        const updated = await waitForEvent(
          state,
          eventOffset,
          command.timeoutMs,
          (event) => event?.type === 'settingsUpdated' ? event : undefined,
          'Desktop Agent configuration update did not publish a result.',
        );
        const status = updated.success === true ? 'applied' : 'rejected';
        if (status !== command.expectedStatus) {
          throw new Error('Desktop Agent configuration update returned an unexpected status.');
        }
        let projection;
        if (status === 'applied') {
          projection = await waitForEvent(
            state,
            eventOffset,
            command.timeoutMs,
            (event) =>
              event?.type === 'settingsData' &&
              event?.conversationId === conversationId &&
              event?.selectedProviderId === providerId &&
              event?.selectedModelId === modelId
                ? event.agentConfiguration
                : undefined,
            'Desktop Agent configuration update did not project its effective values.',
          );
        }
        return {
          accepted: status === 'applied',
          status,
          eventOffset,
          conversationId,
          providerId,
          modelId,
          turnStateAtUpdate,
          ...(command.runningTurnIdentity === undefined
            ? {}
            : { runningTurnIdentity: command.runningTurnIdentity }),
          submissionCountBefore,
          submissionCountAfter: state.submissionCount,
          ...(updated.error === undefined ? {} : { diagnosticMessage: updated.error }),
          ...(projection === undefined ? {} : { projection }),
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
      case 'observe-workflow-step': {
        const state = requireState();
        const conversationId = requireText(command.conversationId, 'Conversation identity');
        const eventOffset = state.events.length;
        bridge.send(state.connection, { type: 'getConversationSnapshot', conversationId });
        bridge.send(state.connection, { type: 'getMessageQueue', conversationId });
        const conversation = await waitForEvent(
          state,
          eventOffset,
          command.timeoutMs,
          (event) => event?.type === 'conversationSnapshot' && event?.conversation?.id === conversationId
            ? event.conversation
            : undefined,
          'Desktop Agent workflow observation did not publish a conversation snapshot.',
        );
        const currentQueue = await waitForEvent(
          state,
          eventOffset,
          command.timeoutMs,
          (event) => findMessageQueueSnapshot(event, conversationId, 'messageQueueSnapshot'),
          'Desktop Agent workflow observation did not publish a message queue snapshot.',
        );
        const actionOffset =
          Number.isInteger(command.afterEventOffset) && command.afterEventOffset >= 0
            ? command.afterEventOffset
            : eventOffset;
        const actionEvents = state.events.slice(actionOffset);
        const queuedSnapshot = actionEvents
          .map((event) => findMessageQueueSnapshot(event, conversationId, 'messageQueued'))
          .find((snapshot) => snapshot?.pendingCount > 0);
        const projectionEvents = state.events.filter(
          (event) => belongsToConversation(event, conversationId) && isProjectionEvent(event),
        );
        return {
          conversationId,
          messages: conversation.messages ?? [],
          messageQueue: queuedSnapshot ?? currentQueue,
          queued: queuedSnapshot !== undefined,
          projectionEvents,
        };
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
