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
  const operations = {
    async connect() {
      return evaluate({ kind: 'connect' });
    },
    async createConversation(command = {}) {
      return evaluate({ kind: 'create', ...command });
    },
    async submit(command) {
      return evaluate({ kind: 'submit', ...command });
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
    async updateConfiguration() {
      throw infrastructureBlocker(
        'DSH session configuration update is unavailable through the public Desktop bridge.',
      );
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
      return operations.resume(command.conversationId);
    },
    async restartAndRestore(command) {
      if (typeof input.restartApplication !== 'function') {
        throw infrastructureBlocker('DSH Desktop application restart lifecycle is unavailable.');
      }
      await input.restartApplication();
      if (typeof input.waitForRenderer === 'function') await input.waitForRenderer();
      return operations.resume(command.conversationId);
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
    const decorateSnapshot = (snapshot) => ({
      ...snapshot,
      messages: (snapshot?.events ?? [])
        .filter((event) => event?.kind === 'message')
        .map((event) => ({
          role: event.role,
          content: event.text,
          ...(event.messageId === undefined ? {} : { id: event.messageId }),
        })),
    });
    const conversationTarget = (surface) => {
      const scope = surface.scope;
      if (scope?.kind === 'workspace' && typeof scope.projectId === 'string') {
        return { kind: 'project', projectId: scope.projectId };
      }
      return { kind: 'surface' };
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
      case 'create': {
        const current = globalThis[stateKey]?.connection ?? (await readSurface());
        const configuration = await sessions.getComposerConfiguration(
          current.workbenchInstanceId,
          current.agentSurfaceId,
        );
        const permissionPresetId = command.permissionPresetId ?? configuration.permissionPresetId;
        const projection = await sessions.create(
          current.workbenchInstanceId,
          current.agentSurfaceId,
          text(permissionPresetId, 'permission preset'),
          command.target ?? conversationTarget(current),
        );
        globalThis[stateKey] = { connection: current, conversationId: projection.conversationId };
        return projection;
      }
      case 'submit': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        const input = command.input ?? { kind: 'message', text: text(command.prompt, 'prompt'), references: [], contextPayloads: [] };
        const result = await sessions.submit(conversationId, input);
        state().conversationId = conversationId;
        return { ...result, projection: decorateSnapshot(result.projection), identity: { conversationId, dshSessionId: result.projection.dshSessionId, turn: latestTurn(result.projection)?.turn } };
      }
      case 'snapshot': {
        const conversationId = text(command.conversationId ?? state().conversationId, 'conversation');
        return decorateSnapshot(await sessions.getSnapshot(conversationId));
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
        return { status: 'facts', facts: { identity: command.identity, projection: decorateSnapshot(snapshot), configuration: { effective: { values: { modelBinding: selected ? { providerId: selected.providerId, modelId: selected.modelId } : undefined } } }, runtimePath: { controller: 'dsh-desktop-session-host', runtime: 'dsh-agent', transcript: 'dsh-session', metadata: 'openneko-conversation-catalog', projection: 'dsh-acp-projection' }, persistence: { checkpoint: 'observed', durability: 'dsh-session' }, disposal: { status: 'disposed' }, diagnostics: { items: snapshot.events.filter((event) => event.kind === 'diagnostic').map((event) => ({ severity: 'error', code: event.code, message: event.message })), droppedCount: 0 }, receipts: {} } };
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

function infrastructureBlocker(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}
