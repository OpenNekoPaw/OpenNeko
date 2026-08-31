import { setTimeout as delay } from 'node:timers/promises';

const DSH_DRIVER_STATE_KEY = '__openNekoDshDesktopDriver';

/**
 * Drives the public DSH Desktop ports from the renderer. The driver deliberately
 * exposes only product operations and DSH projection facts; it never reads DSH
 * storage or creates a second transcript/session owner.
 */
export function createDshDesktopAgentDriver(input) {
  if (typeof input?.evaluate !== 'function') {
    throw infrastructureBlocker('DSH Desktop driver requires a renderer evaluate function.');
  }
  const evaluate = (command) => input.evaluate(dshDriverExpression(command));
  const workflowEventOffsets = new Map();
  const operations = {
    async connect() {
      return evaluate({ kind: 'connect' });
    },
    async submit(command) {
      return evaluate({ kind: 'submit', ...command });
    },
    async submitWithFollowup(command) {
      const firstSubmission = await evaluate({
        kind: 'composer-submit',
        conversationId: command.conversationId,
        prompt: command.prompt,
        expectedMode: 'send',
        timeoutMs: command.activeTimeoutMs,
      });
      const deadline = Date.now() + command.activeTimeoutMs;
      let activeSnapshot = firstSubmission.projection;
      while (Date.now() < deadline) {
        if (activeSnapshot?.currentTurn !== undefined) break;
        await delay(25);
        activeSnapshot = await evaluate({
          kind: 'snapshot',
          conversationId: command.conversationId,
        });
      }
      if (activeSnapshot?.currentTurn === undefined) {
        throw new Error('DSH Desktop Session did not expose an active turn for inbox enqueue.');
      }
      const configurationUpdate =
        command.followupChatModel === undefined
          ? {}
          : await operations.updateConfiguration({
              conversationId: command.conversationId,
              providerId: command.followupChatModel.providerId,
              modelId: command.followupChatModel.modelId,
              turnState: 'active',
              timeoutMs: command.activeTimeoutMs,
              visibleControl: true,
            });
      const followup = await evaluate({
        kind: 'composer-submit',
        conversationId: command.conversationId,
        prompt: command.followupPrompt,
        expectedMode: 'queue',
        timeoutMs: command.activeTimeoutMs,
      });
      const queued = followup?.projection?.inbox?.nextTurn;
      if (!Array.isArray(queued) || queued.length === 0) {
        throw new Error('DSH Desktop follow-up did not project a pending next-turn inbox item.');
      }
      const queuedMessageId = queued[queued.length - 1]?.messageId;
      if (typeof queuedMessageId !== 'string' || queuedMessageId.length === 0) {
        throw new Error('DSH Desktop follow-up did not expose an exact inbox Message identity.');
      }
      if (command.delivery !== 'send-now') {
        throw new Error('DSH Desktop follow-up delivery must use the visible send-now action.');
      }
      const promoted = await evaluate({
        kind: 'queue-send-now',
        conversationId: command.conversationId,
        messageId: queuedMessageId,
        timeoutMs: command.activeTimeoutMs,
      });
      return {
        ...promoted,
        ...configurationUpdate,
        accepted: true,
        facts: {
          inboxEnqueued: true,
          sendNowRequested: true,
          queuedMessageId,
          activeTurn: activeSnapshot.currentTurn,
        },
      };
    },
    async markEventOffset() {
      return { eventOffset: 0 };
    },
    async waitForActiveConversation() {
      return evaluate({ kind: 'active-conversation' });
    },
    async waitForIdle(conversationId, timeoutMs = 180_000) {
      return evaluate({ kind: 'wait-for-idle', conversationId, timeoutMs });
    },
    async readProjection(conversationId) {
      return evaluate({ kind: 'snapshot', conversationId });
    },
    async readFacts(identity) {
      return evaluate({ kind: 'facts', identity });
    },
    async observeWorkflowStep(command) {
      const snapshot = await evaluate({ kind: 'snapshot', conversationId: command.conversationId });
      const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
      const offset = workflowEventOffsets.get(command.conversationId) ?? 0;
      if (events.length < offset) {
        throw new Error('DSH Desktop workflow event projection moved behind its observed offset.');
      }
      workflowEventOffsets.set(command.conversationId, events.length);
      return { ...snapshot, events: events.slice(offset) };
    },
    async waitForIdentity(conversationId, _afterEventOffset, timeoutMs) {
      return evaluate({ kind: 'wait-for-idle', conversationId, timeoutMs }).then(
        (result) => result.identity,
      );
    },
    async waitForPendingTool(conversationId, toolName) {
      return evaluate({ kind: 'pending-permission', conversationId, toolName });
    },
    async confirm(command) {
      return operations.decidePermission(command, command.optionId);
    },
    async invokeInput(command) {
      return evaluate({ kind: 'invoke-input', ...command });
    },
    async updateConfiguration(command) {
      return evaluate({ kind: 'update-model', ...command });
    },
    async resume(command) {
      const conversationId = typeof command === 'string' ? command : command?.conversationId;
      const snapshot = await evaluate({ kind: 'snapshot', conversationId });
      return { accepted: true, snapshot };
    },
    async cancel(conversationId) {
      return evaluate({ kind: 'cancel', conversationId });
    },
    async listPermissions(conversationId) {
      return evaluate({ kind: 'permissions', conversationId });
    },
    async decidePermission(identity, optionId) {
      return evaluate({ kind: 'decide-permission', identity, optionId });
    },
    async reloadRenderer() {
      return evaluate({ kind: 'reload-renderer' });
    },
    async closeApplication() {
      return evaluate({ kind: 'close' });
    },
    async dispose() {
      return evaluate({ kind: 'dispose' });
    },
  };
  return Object.freeze({
    ...operations,
    async reloadAndRestore(command) {
      if (typeof input.waitForRenderer !== 'function') {
        throw infrastructureBlocker('DSH Desktop renderer reload lifecycle is unavailable.');
      }
      await operations.reloadRenderer();
      await input.waitForRenderer();
      const connected = await operations.connect();
      requireRestoredConversation(connected.connection, command.conversationId);
      const resumed = await operations.resume(command.conversationId);
      return { accepted: true, connection: connected.connection, snapshot: resumed.snapshot };
    },
    async restartAndRestore(command) {
      if (typeof input.restartApplication !== 'function') {
        throw infrastructureBlocker('DSH Desktop application restart lifecycle is unavailable.');
      }
      await input.restartApplication();
      if (typeof input.waitForRenderer === 'function') await input.waitForRenderer();
      const connected = await operations.connect();
      requireRestoredConversation(connected.connection, command.conversationId);
      const resumed = await operations.resume(command.conversationId);
      return { accepted: true, connection: connected.connection, snapshot: resumed.snapshot };
    },
  });
}

export function dshDriverExpression(command) {
  return `(async (command) => {
    const stateKey = ${JSON.stringify(DSH_DRIVER_STATE_KEY)};
    const desktop = window.openNekoDesktop;
    const sessions = desktop?.dshSessions;
    const permissions = desktop?.dshPermissions;
    const runtime = desktop?.dshRuntime;
    const shell = desktop?.shell;
    if (!sessions || !permissions || !runtime || !shell) {
      throw new Error('Public DSH Desktop bridges are unavailable.');
    }
    const text = (value, label) => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(label + ' is required.');
      }
      return value;
    };
    const readSurface = async () => {
      const projection = await shell.getSnapshot();
      const workbench = projection?.window?.workbench;
      const interaction = workbench?.scene?.slots?.interaction;
      const context = workbench?.scene?.context;
      if (!workbench || interaction?.kind !== 'agent' || context?.kind !== 'agent') {
        throw new Error('DSH Desktop Agent surface is unavailable.');
      }
      return {
        windowId: projection.window.windowId,
        rendererSessionId: projection.rendererSessionId,
        workbenchInstanceId: workbench.workbenchInstanceId,
        agentSurfaceId: interaction.agentSurfaceId,
        scope: context.scope,
      };
    };
    const state = () => {
      const value = globalThis[stateKey];
      if (!value) throw new Error('DSH Desktop driver is not connected.');
      return value;
    };
    const isIdle = (snapshot) => snapshot?.currentTurn === undefined;
    const latestTurn = (snapshot) => {
      const ends = (snapshot?.events ?? []).filter(
        (event) => event?.kind === 'turn' && event.phase === 'end',
      );
      return ends.length > 0 ? ends[ends.length - 1] : undefined;
    };
    const turnCount = (snapshot) =>
      (snapshot?.events ?? []).filter(
        (event) => event?.kind === 'turn' && event.phase === 'start',
      ).length;
    const decorateSnapshot = (snapshot) => ({
      ...snapshot,
      messages: (snapshot?.events ?? [])
        .filter((event) => event?.kind === 'message')
        .map((event) => ({
          role: event.role,
          content:
            event.role === 'assistant'
              ? event.text
              : (event.content ?? [])
                  .filter((block) => block?.type === 'text')
                  .map((block) => block.text)
                  .join(''),
          ...(event.messageId === undefined ? {} : { id: event.messageId }),
        })),
    });
    const sha256 = async (value) => {
      const bytes = new TextEncoder().encode(value);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const projectSkillReceipts = async (snapshot, configuration) => {
      const completed = (snapshot?.events ?? []).filter(
        (event) =>
          event?.kind === 'tool' &&
          event.status === 'completed' &&
          event.title === 'skill' &&
          typeof event.rawInput?.name === 'string',
      );
      const items = [];
      for (const event of completed) {
        const rendered = (event.rawOutput ?? []).find(
          (block) => block?.type === 'text' && typeof block.text === 'string',
        )?.text;
        const instructions = rendered?.match(
          /<skill_instructions>\\n([\\s\\S]*?)\\n<\\/skill_instructions>/u,
        )?.[1]?.trim();
        if (!instructions) continue;
        const descriptor = configuration.inputCatalog?.skills?.find(
          (skill) => skill.name === event.rawInput.name,
        );
        items.push({
          name: event.rawInput.name,
          source:
            descriptor?.provider === 'openneko-builtin' || descriptor?.source === 'bundled'
              ? 'builtin'
              : descriptor?.source,
          fingerprint: 'sha256:' + (await sha256(instructions)),
          status: 'injected',
          toolCallId: event.toolCallId,
        });
      }
      return {
        limit: 100,
        items,
        droppedCount: configuration.inputCatalog?.skillsComplete === false ? 1 : 0,
      };
    };
    const conversationTarget = (surface) => {
      const scope = surface.scope;
      if (scope?.kind === 'workspace' && typeof scope.projectId === 'string') {
        return { kind: 'project', projectId: scope.projectId };
      }
      return { kind: 'surface' };
    };
    const waitFor = async (label, timeoutMs, read) => {
      const deadline = Date.now() + (Number.isFinite(timeoutMs) ? timeoutMs : 180000);
      while (Date.now() < deadline) {
        const value = await read();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(label + ' did not become observable before timeout.');
    };
    const requireVisibleConversation = async (conversationId) => {
      const surface = await readSurface();
      if (surface.scope?.conversationId !== conversationId) {
        throw new Error('Visible DSH Composer does not own the exact requested Conversation.');
      }
      return surface;
    };
    switch (command.kind) {
      case 'connect': {
        const surface = await readSurface();
        const configuration = await sessions.getComposerConfiguration(
          surface.workbenchInstanceId,
          surface.agentSurfaceId,
        );
        const selectable = configuration.permissionPresets.find((item) => item.selectable);
        if (!selectable) throw new Error('DSH permission preset catalog has no selectable option.');
        const connection = { ...surface, permissionPresetId: selectable.id };
        globalThis[stateKey] = { connection };
        return { connection, configuration };
      }
      case 'active-conversation': {
        const surface = await readSurface();
        const conversationId = surface.scope?.conversationId;
        if (typeof conversationId !== 'string' || conversationId.length === 0) {
          throw new Error('Active DSH Conversation is unavailable.');
        }
        return { conversationId };
      }
      case 'submit': {
        const current = state().connection;
        const input = command.input ?? {
          kind: 'message',
          text: text(command.prompt, 'prompt'),
          references: [],
          images: [],
          contextPayloads: command.contextPayloads ?? [],
        };
        let conversationId = command.conversationId ?? state().conversationId;
        let projection;
        let stopReason;
        if (conversationId === undefined) {
          const configuration = await sessions.getComposerConfiguration(
            current.workbenchInstanceId,
            current.agentSurfaceId,
          );
          const permissionPresetId = command.permissionPresetId ?? configuration.permissionPresetId;
          projection = await sessions.create(
            current.workbenchInstanceId,
            current.agentSurfaceId,
            text(permissionPresetId, 'permission preset'),
            command.target ?? conversationTarget(current),
            input,
          );
          conversationId = projection.conversationId;
        } else {
          conversationId = text(conversationId, 'conversation');
          const result = await sessions.submit(conversationId, input);
          projection = result.projection;
          stopReason = result.stopReason;
        }
        state().conversationId = conversationId;
        return {
          accepted: true,
          conversationId,
          eventOffset: 0,
          ...(stopReason === undefined ? {} : { stopReason }),
          projection: decorateSnapshot(projection),
          identity: {
            conversationId,
            dshSessionId: projection.dshSessionId,
            turn: latestTurn(projection)?.turn,
          },
        };
      }
      case 'composer-submit': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        await requireVisibleConversation(conversationId);
        const input = document.querySelector('[data-agent-composer-input="true"]');
        if (!(input instanceof HTMLTextAreaElement)) {
          throw new Error('Visible DSH Composer input is unavailable.');
        }
        const mode = command.expectedMode === 'queue' ? 'queue' : 'send';
        const before = await sessions.getSnapshot(conversationId);
        const beforeIds = new Set((before.inbox?.nextTurn ?? []).map((item) => item.messageId));
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!setter) throw new Error('Visible DSH Composer value setter is unavailable.');
        setter.call(input, text(command.prompt, 'prompt'));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const submit = document.querySelector('[data-agent-composer-submit="' + mode + '"]');
        if (!(submit instanceof HTMLButtonElement) || submit.disabled) {
          throw new Error('Visible DSH Composer ' + mode + ' action is unavailable.');
        }
        submit.click();
        const projection = await waitFor('Visible DSH Composer submission', command.timeoutMs, async () => {
          const snapshot = await sessions.getSnapshot(conversationId);
          if (mode === 'send') return snapshot.currentTurn === undefined ? undefined : snapshot;
          return (snapshot.inbox?.nextTurn ?? []).some((item) => !beforeIds.has(item.messageId))
            ? snapshot
            : undefined;
        });
        state().conversationId = conversationId;
        return { accepted: true, projection: decorateSnapshot(projection) };
      }
      case 'queue-send-now': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        const messageId = text(command.messageId, 'inbox Message');
        await requireVisibleConversation(conversationId);
        const row = [...document.querySelectorAll('[data-agent-queue-item-id]')].find(
          (item) => item.getAttribute('data-agent-queue-item-id') === messageId,
        );
        const action = row?.querySelector('[data-agent-queue-action="send-now"]');
        if (!(action instanceof HTMLButtonElement) || action.disabled) {
          throw new Error('Visible DSH queue send-now action is unavailable for the exact Message.');
        }
        action.click();
        const projection = await waitFor('Visible DSH queue send-now action', command.timeoutMs, async () => {
          const snapshot = await sessions.getSnapshot(conversationId);
          return (snapshot.inbox?.nextTurn ?? []).some((item) => item.messageId === messageId)
            ? undefined
            : snapshot;
        });
        return { accepted: true, projection: decorateSnapshot(projection) };
      }
      case 'snapshot': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        return decorateSnapshot(await sessions.getSnapshot(conversationId));
      }
      case 'update-model': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        const surface = await readSurface();
        if (surface.scope?.conversationId !== conversationId) {
          throw new Error('DSH model update requires the exact visible Conversation surface.');
        }
        const before = await sessions.getSnapshot(conversationId);
        const turnStateAtUpdate = isIdle(before) ? 'idle' : 'active';
        if (command.turnState !== turnStateAtUpdate) {
          throw new Error('DSH model update does not match the required Session turn state.');
        }
        const configuration = await sessions.getComposerConfiguration(
          surface.workbenchInstanceId,
          surface.agentSurfaceId,
        );
        const matches = configuration.models.filter(
          (item) => item.providerId === command.providerId && item.modelId === command.modelId,
        );
        if (matches.length === 0) {
          return {
            accepted: false,
            status: 'rejected',
            conversationId,
            providerId: command.providerId,
            modelId: command.modelId,
            turnStateAtUpdate,
            turnCountBefore: turnCount(before),
            turnCountAfter: turnCount(before),
            diagnosticMessage: 'Requested DSH model is unavailable on the exact Agent surface.',
          };
        }
        if (matches.length !== 1) {
          throw new Error('Requested DSH model must resolve to exactly one Composer option.');
        }
        const selected = matches[0];
        let applied;
        if (command.visibleControl === true) {
          const trigger = document.querySelector('[data-agent-model-config-trigger="true"]');
          if (!(trigger instanceof HTMLButtonElement) || trigger.disabled) {
            throw new Error('Visible DSH model configuration control is unavailable.');
          }
          trigger.click();
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const option = [...document.querySelectorAll('[data-agent-model-option-id]')].find(
            (item) => item.getAttribute('data-agent-model-option-id') === selected.id,
          );
          if (!(option instanceof HTMLButtonElement) || option.disabled) {
            throw new Error('Visible DSH model option is unavailable.');
          }
          option.click();
          applied = await waitFor('Visible DSH model configuration', command.timeoutMs, async () => {
            const next = await sessions.getComposerConfiguration(
              surface.workbenchInstanceId,
              surface.agentSurfaceId,
            );
            return next.selectedModelOptionId === selected.id ? next : undefined;
          });
        } else {
          applied = await sessions.selectComposerModel(
            surface.workbenchInstanceId,
            surface.agentSurfaceId,
            selected.id,
          );
        }
        const effective = applied.models.find(
          (item) => item.id === applied.selectedModelOptionId,
        );
        if (
          effective?.providerId !== command.providerId ||
          effective.modelId !== command.modelId
        ) {
          throw new Error('DSH model update did not project the requested effective model.');
        }
        const after = await sessions.getSnapshot(conversationId);
        return {
          accepted: true,
          status: 'applied',
          conversationId,
          providerId: command.providerId,
          modelId: command.modelId,
          turnStateAtUpdate,
          turnCountBefore: turnCount(before),
          turnCountAfter: turnCount(after),
          projection: {
            request: { providerId: command.providerId, modelId: command.modelId },
            fields: {
              model: {
                effectiveValue: {
                  providerId: effective.providerId,
                  modelId: effective.modelId,
                },
              },
            },
          },
        };
      }
      case 'wait-for-idle': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        const deadline = Date.now() + (Number.isFinite(command.timeoutMs) ? command.timeoutMs : 180000);
        let snapshot;
        while (Date.now() < deadline) {
          snapshot = await sessions.getSnapshot(conversationId);
          if (isIdle(snapshot)) {
            const end = latestTurn(snapshot);
            if (end) return { status: 'idle', identity: { conversationId, dshSessionId: snapshot.dshSessionId, turn: end.turn }, snapshot: decorateSnapshot(snapshot) };
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('DSH Desktop Session did not reach terminal idle.');
      }
      case 'facts': {
        const conversationId = text(command.identity?.conversationId ?? state().conversationId, 'conversation');
        const snapshot = await sessions.getSnapshot(conversationId);
        const surface = await readSurface();
        const configuration = await sessions.getComposerConfiguration(
          surface.workbenchInstanceId,
          surface.agentSurfaceId,
        );
        const selected = configuration.models.find(
          (item) => item.id === configuration.selectedModelOptionId,
        );
        if (!selected) throw new Error('DSH Desktop Session has no effective selected model.');
        const skills = await projectSkillReceipts(snapshot, configuration);
        return { status: 'facts', facts: { identity: command.identity, projection: decorateSnapshot(snapshot), configuration: { effective: { values: { modelBinding: { providerId: selected.providerId, modelId: selected.modelId } } } }, runtimePath: { controller: 'dsh-desktop-session-host', runtime: 'dsh-agent', transcript: 'dsh-session', metadata: 'openneko-conversation-catalog', projection: 'dsh-acp-projection' }, persistence: { checkpoint: 'observed', durability: 'dsh-session' }, disposal: { status: 'disposed' }, diagnostics: { items: snapshot.events.filter((event) => event.kind === 'diagnostic').map((event) => ({ severity: 'error', code: event.code, message: event.message })), droppedCount: 0 }, receipts: { skills } } };
      }
      case 'permissions':
        return permissions.list(text(command.conversationId ?? state().conversationId, 'conversation'));
      case 'pending-permission': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        const pending = await permissions.list(conversationId);
        const match = pending.find((item) => !command.toolName || item.title === command.toolName);
        if (!match) throw new Error('Requested DSH permission is not pending.');
        const option = match.options.find((item) => item.kind === 'allow_once' || item.kind === 'allow_always');
        if (!option) throw new Error('Pending DSH permission has no selectable allow option.');
        return { ...match, optionId: option.optionId };
      }
      case 'decide-permission':
        return permissions.decide(command.identity, text(command.optionId, 'permission option'));
      case 'invoke-input': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        const surface = await readSurface();
        const configuration = await sessions.getComposerConfiguration(
          surface.workbenchInstanceId,
          surface.agentSurfaceId,
        );
        const entries = configuration.inputCatalog?.entries ?? [];
        const entry = entries.find(
          (item) => item.trigger === command.trigger && item.name === command.name && item.availability.status === 'available',
        );
        if (!entry) throw new Error('Requested DSH command or Skill is unavailable.');
        const input = command.trigger === 'command'
          ? { kind: 'command', line: command.args ? entry.name + ' ' + command.args : entry.name }
          : { kind: 'skill', skillName: entry.name, displayText: '$' + entry.name, ...(command.args === undefined ? {} : { args: command.args }) };
        const result = await sessions.submit(conversationId, input);
        return { accepted: true, trigger: command.trigger, name: command.name, result };
      }
      case 'cancel':
        return sessions.cancel(text(command.conversationId ?? state().conversationId, 'conversation'));
      case 'reload-renderer':
        window.location.reload();
        return { reloading: true };
      case 'close':
        {
          const conversationId = globalThis[stateKey]?.conversationId;
          const snapshot = conversationId
            ? decorateSnapshot(await sessions.getSnapshot(conversationId))
            : undefined;
          return {
            status: 'facts',
            facts: {
              ...(conversationId ? { conversationId } : {}),
              ...(snapshot ? { projection: snapshot } : {}),
              disposal: { status: 'disposed' },
            },
          };
        }
      case 'dispose':
        delete globalThis[stateKey];
        return { disposed: true };
      default:
        throw new Error('Unsupported DSH Desktop driver operation: ' + String(command.kind));
    }
  })(${JSON.stringify(command)})`;
}

function requireRestoredConversation(connection, conversationId) {
  if (connection?.scope?.conversationId !== conversationId) {
    throw new Error('Restored DSH Agent surface does not own the exact requested Conversation.');
  }
}

function infrastructureBlocker(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}
