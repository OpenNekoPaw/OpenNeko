import { copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const RESPONSE_MARKER = 'OPENNEKO_UI_AGENT_OK_20260805';
const RESPONSE_TIMEOUT_MS = 90_000;

export function resolveVisibleAgentProviderAuthorization(env = process.env, userHome = homedir()) {
  const providerId = requireEnvironmentIdentity(env.OPENNEKO_AGENT_EVAL_PROVIDER_ID, 'provider');
  const modelId = requireEnvironmentIdentity(env.OPENNEKO_AGENT_EVAL_MODEL_ID, 'model');
  if (env.OPENNEKO_AGENT_EVAL_COST_APPROVED !== 'true') {
    throw infrastructureBlocker(
      'Visible Desktop Agent provider cost authorization is not approved.',
    );
  }
  return Object.freeze({
    providerId,
    modelId,
    configurationFile: join(userHome, '.neko', 'config.toml'),
  });
}

export const desktopAgentProviderUiScenario = Object.freeze({
  id: 'desktop-agent-provider-ui',
  owner: '@neko/agent-runtime',
  async prepare({ fixtureHome }) {
    const authorization = resolveVisibleAgentProviderAuthorization();
    const workspacePath = join(fixtureHome, 'workspace');
    const fixtureConfigRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(fixtureConfigRoot, { recursive: true }),
    ]);
    await copyFile(authorization.configurationFile, join(fixtureConfigRoot, 'config.toml')).catch(
      (cause) => {
        throw infrastructureBlocker(
          'Authorized Desktop Agent configuration ~/.neko/config.toml is unavailable.',
          cause,
        );
      },
    );
    return {
      workspacePath,
      providerId: authorization.providerId,
      modelId: authorization.modelId,
      databasePath: join(fixtureHome, '.neko', 'neko.db'),
    };
  },
  async run({ checkpoint, click, evaluate, prepared, screenshot, type, waitForSelector }) {
    await evaluate(`(() => {
      window.resizeTo(1440, 960);
      return { width: window.innerWidth, height: window.innerHeight };
    })()`);
    await waitForSelector('.desktop-scene-workbench--agent-only .agent-composer-textarea');
    await waitForSelector('.agent-model-config-trigger');
    const entry = await inspectEntryDraft(evaluate);
    checkpoint('visible-entry-draft-ready', entry);

    await click('.agent-model-config-trigger');
    await waitForSelector('.agent-model-config-radio-selected');
    const modelSelection = await inspectSelectedModel(evaluate);
    await click('.agent-model-config-trigger');
    checkpoint('visible-provider-model-selected', {
      authorizedProviderId: prepared.providerId,
      authorizedModelId: prepared.modelId,
      ...modelSelection,
    });

    const prompt =
      `Reply with exactly ${RESPONSE_MARKER} and no other text. ` +
      'Do not call tools and do not quote this instruction.';
    await type('.agent-composer-textarea', prompt);
    await waitForCondition(
      evaluate,
      `(() => {
        const send = document.querySelector('.agent-composer-send');
        return send instanceof HTMLButtonElement && !send.disabled;
      })()`,
      'Visible Entry Draft did not enable its send control.',
    );
    await beginExecutionActivityObservation(evaluate);
    await click('.agent-composer-send');
    checkpoint('visible-composer-submit-dispatched', await inspectVisibleAgentDom(evaluate));

    await waitForCondition(
      evaluate,
      `(() => [...document.querySelectorAll(
        '[data-owner-root="agent"] .agent-user-prompt',
      )].some((element) => element.textContent?.trim() === ${JSON.stringify(prompt)}) &&
        Boolean(document.querySelector(
          '.primary-conversation-group[data-group-kind="assistant"] ' +
            '.primary-recent-conversation-row[data-active="true"] .home-conversation-link',
        )))()`,
      'Visible Entry Draft did not activate its Assistant session and sent transcript.',
    );
    checkpoint(
      'visible-assistant-conversation-materialized',
      await inspectVisibleAgentDom(evaluate),
    );
    await waitForCondition(
      evaluate,
      `(() => window.__openNekoAgentProviderUiObservation?.sawTranscriptActivity === true)()`,
      'Visible Desktop Agent did not project live execution activity into the transcript.',
    );
    checkpoint('visible-transcript-execution-activity', await inspectProviderWaitState(evaluate));

    await waitForProviderResponse(
      evaluate,
      prepared.databasePath,
      `(async () => {
        const projection = await window.openNekoDesktop.shell.getSnapshot();
        ${requireActiveWorkbenchProjection('projection')}
        const context = activeWorkbench.scene.context;
        const alerts = [...document.querySelectorAll('[role="alert"]')]
          .map((element) => element.textContent?.trim() ?? '')
          .filter(Boolean);
        if (alerts.length > 0) {
          throw new Error('Visible Desktop Agent failed: ' + alerts.join(' | '));
        }
        const assistantRows = [...document.querySelectorAll(
          '[data-owner-root="agent"] .agent-message-row',
        )].filter((row) => !row.querySelector('.agent-user-prompt'));
        const responseVisible = assistantRows.some((row) =>
          row.textContent?.includes(${JSON.stringify(RESPONSE_MARKER)}) === true,
        );
        const sentPromptVisible = [...document.querySelectorAll(
          '[data-owner-root="agent"] .agent-user-prompt',
        )].some((element) => element.textContent?.trim() === ${JSON.stringify(prompt)});
        const activeConversationVisible = Boolean(document.querySelector(
          '.primary-conversation-group[data-group-kind="assistant"] '
            + '.primary-recent-conversation-row[data-active="true"] .home-conversation-link',
        ));
        const activeConversation = projection.agentHome.conversations.find((conversation) =>
          conversation.navigation.conversationId === context.scope.conversationId,
        );
        if (activeConversation?.lastActivity.kind === 'turn-failed') {
          throw new Error('Visible Desktop Agent turn entered failed terminal state.');
        }
        return context.kind === 'agent' &&
          context.scope.kind === 'assistant' &&
          typeof context.scope.conversationId === 'string' &&
          activeConversation?.navigation.owner.kind === 'assistant' &&
          sentPromptVisible &&
          responseVisible &&
          activeConversationVisible &&
          !document.querySelector('.agent-run-status') &&
          !document.querySelector('.agent-execution-activity') &&
          !document.querySelector('.agent-composer-stop') &&
          Boolean(document.querySelector('.agent-composer-textarea'));
      })()`,
    );

    const [evidence, lifecycle] = await Promise.all([
      inspectCompletedConversation(evaluate, prompt),
      readLatestVisibleAgentLifecycleState(prepared.databasePath),
    ]);
    if (lifecycle?.status !== 'completed') {
      throw new Error('Visible Desktop Agent completed without a persisted lifecycle terminal.');
    }
    const screenshotArtifact = await screenshot('desktop-agent-provider-response-visible');
    checkpoint('visible-provider-response-complete', { ...evidence, lifecycle });
    return {
      authorization: {
        providerId: prepared.providerId,
        modelId: prepared.modelId,
        source: '~/.neko/config.toml',
      },
      entry,
      modelSelection,
      conversation: evidence,
      lifecycle,
      screenshots: [screenshotArtifact],
      submitPath: 'visible-composer',
      bridgeCreatedConversation: false,
    };
  },
});

async function inspectVisibleAgentDom(evaluate) {
  return evaluate(`(() => ({
    activeConversationVisible: Boolean(document.querySelector(
      '.primary-conversation-group[data-group-kind="assistant"] ' +
        '.primary-recent-conversation-row[data-active="true"] .home-conversation-link',
    )),
    transcriptActivity: document.querySelector(
      '[data-owner-root="agent"] .agent-message-list .agent-execution-activity',
    )?.textContent?.trim() ?? undefined,
    composerAvailable: Boolean(document.querySelector('.agent-composer-textarea')),
    stopControlVisible: Boolean(document.querySelector('.agent-composer-stop')),
    visibleMessages: [...document.querySelectorAll(
      '[data-owner-root="agent"] .agent-message-row',
    )].map((row) => row.textContent?.trim() ?? '').filter(Boolean),
    alerts: [...document.querySelectorAll('[role="alert"]')]
      .map((element) => element.textContent?.trim() ?? '')
      .filter(Boolean),
  }))()`);
}

async function inspectEntryDraft(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    const textarea = document.querySelector('.agent-composer-textarea');
    if (context.kind !== 'agent' || context.scope.kind !== 'unbound') {
      throw new Error('Visible provider scenario did not start from an unbound Entry Draft.');
    }
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.value !== '') {
      throw new Error('Visible provider scenario Entry Draft composer was not empty.');
    }
    if (projection.agentHome.conversations.length !== 0) {
      throw new Error('Isolated visible provider fixture unexpectedly restored an existing conversation.');
    }
    const toolbar = document.querySelector('.agent-composer-toolbar');
    const shortcutVisible = [...(toolbar?.querySelectorAll('.agent-composer-tool-button') ?? [])]
      .some((button) => ['/', '$'].includes(button.textContent?.trim() ?? ''));
    const presentation = document.querySelector('.agent-composer-rail')
      ?.getAttribute('data-composer-presentation');
    if (
      presentation !== 'desktop-entry' ||
      !document.querySelector('.agent-model-config-trigger') ||
      !document.querySelector('.agent-composer-project-trigger') ||
      document.querySelector('.agent-control-chip-mode') ||
      document.querySelector('.agent-execution-mode-trigger') ||
      shortcutVisible ||
      textarea.placeholder.includes('/') ||
      textarea.placeholder.includes('$')
    ) {
      throw new Error('Visible provider scenario Entry Draft is not Agent-only.');
    }
    return {
      draftId: context.scope.draftId,
      conversationCount: projection.agentHome.conversations.length,
      composerFocused: document.activeElement === textarea,
      presentation,
      agentOnly: true,
    };
  })()`);
}

async function inspectSelectedModel(evaluate) {
  return evaluate(`(() => {
    const selected = document.querySelector('.agent-model-config-radio-selected');
    if (!(selected instanceof HTMLButtonElement) || selected.getAttribute('aria-checked') !== 'true') {
      throw new Error('Visible Desktop Agent has no selected chat model.');
    }
    const group = selected.closest('.agent-model-provider-group');
    return {
      providerLabel: group?.querySelector('.agent-model-provider-name')?.textContent?.trim() ?? '',
      modelLabel: selected.querySelector('.agent-model-option-name')?.textContent?.trim() ?? '',
      triggerLabel: document.querySelector('.agent-model-config-trigger')?.textContent?.trim() ?? '',
    };
  })()`);
}

async function inspectCompletedConversation(evaluate, sentPrompt) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'assistant' ||
        typeof context.scope.conversationId !== 'string') {
      throw new Error('Visible provider response did not retain an exact Assistant conversation.');
    }
    const summary = projection.agentHome.conversations.find(
      (conversation) => conversation.navigation.conversationId === context.scope.conversationId,
    );
    if (!summary || summary.navigation.owner.kind !== 'assistant') {
      throw new Error('Visible provider response is absent from the Assistant navigation projection.');
    }
    const assistantRows = [...document.querySelectorAll(
      '[data-owner-root="agent"] .agent-message-row',
    )].filter((row) => !row.querySelector('.agent-user-prompt'));
    const response = assistantRows.find((row) =>
      row.textContent?.includes(${JSON.stringify(RESPONSE_MARKER)}) === true,
    );
    const userPrompt = [...document.querySelectorAll(
      '[data-owner-root="agent"] .agent-user-prompt',
    )].find((element) => element.textContent?.trim() === ${JSON.stringify(sentPrompt)});
    const messageList = document.querySelector('[data-owner-root="agent"] .agent-message-list');
    const visibleItems = [...document.querySelectorAll(
      '[data-owner-root="agent"] .agent-message-list-item',
    )].filter((element) => element.getBoundingClientRect().height > 0);
    const visibleRails = visibleItems.map((item) => item.firstElementChild).filter(
      (element) => element instanceof HTMLElement && element.classList.contains('agent-transcript-rail'),
    );
    if (!(messageList instanceof HTMLElement) || visibleItems.length === 0 ||
        visibleRails.length !== visibleItems.length) {
      throw new Error('Visible provider transcript does not use one rail for every visible item.');
    }
    const messageListRect = messageList.getBoundingClientRect();
    const railLayouts = visibleRails.map((rail) => {
      const rect = rail.getBoundingClientRect();
      return {
        width: rect.width,
        inlineStart: rect.left - messageListRect.left,
        inlineEnd: messageListRect.right - rect.right,
      };
    });
    const railLayoutValid = railLayouts.every((layout) =>
      layout.width <= 820.5 &&
      layout.width < messageListRect.width &&
      Math.abs(layout.inlineStart - layout.inlineEnd) <= 1,
    );
    const alerts = [...document.querySelectorAll('[role="alert"]')]
      .map((element) => element.textContent?.trim() ?? '')
      .filter(Boolean);
    const forbiddenDiagnostics = [
      'NOT NULL constraint failed',
      'context_schema_version',
      'attachment-identity-mismatch',
      'attachment endpoint mismatch',
    ].filter((diagnostic) => document.body.textContent?.includes(diagnostic));
    const activityObservation = window.__openNekoAgentProviderUiObservation;
    activityObservation?.observer.disconnect();
    if (!(userPrompt instanceof HTMLElement) || !(response instanceof HTMLElement) ||
        !railLayoutValid || alerts.length > 0 || forbiddenDiagnostics.length > 0 ||
        activityObservation?.sawTranscriptActivity !== true ||
        document.querySelector('.agent-execution-activity') ||
        document.querySelector('.agent-run-status') ||
        document.querySelector('.agent-header-action-roleplay')) {
      throw new Error('Visible provider response completed with a launch or projection diagnostic.');
    }
    const activeNavigation = document.querySelector(
      '.primary-conversation-group[data-group-kind="assistant"] '
        + '.primary-recent-conversation-row[data-active="true"] .home-conversation-link',
    );
    if (!(activeNavigation instanceof HTMLButtonElement)) {
      throw new Error('Visible provider response has no active PrimarySidebar conversation.');
    }
    return {
      conversationId: context.scope.conversationId,
      assistantSpaceId: context.scope.assistantSpaceId,
      ownerKind: summary.navigation.owner.kind,
      responseMarker: ${JSON.stringify(RESPONSE_MARKER)},
      sentPrompt: userPrompt.textContent?.trim() ?? '',
      assistantResponse: response.textContent?.trim() ?? '',
      transcriptLayout: {
        messageListWidth: messageListRect.width,
        rails: railLayouts,
      },
      activeNavigationLabel: activeNavigation.textContent?.trim() ?? '',
      conversationCount: projection.agentHome.conversations.length,
      alerts,
      forbiddenDiagnostics,
      executionActivity: {
        appearedInTranscript: activityObservation.sawTranscriptActivity,
        terminalActivityVisible: Boolean(document.querySelector('.agent-execution-activity')),
      },
    };
  })()`);
}

async function beginExecutionActivityObservation(evaluate) {
  await evaluate(`(() => {
    window.__openNekoAgentProviderUiObservation?.observer?.disconnect();
    const observation = {
      sawTranscriptActivity: false,
      observer: undefined,
    };
    const inspect = () => {
      const activity = document.querySelector(
        '[data-owner-root="agent"] .agent-message-list .agent-execution-activity',
      );
      observation.sawTranscriptActivity ||= activity instanceof HTMLElement;
    };
    observation.observer = new MutationObserver(inspect);
    observation.observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.__openNekoAgentProviderUiObservation = observation;
    inspect();
  })()`);
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(message);
}

async function waitForProviderResponse(evaluate, databasePath, expression) {
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [uiComplete, lifecycleState] = await Promise.all([
      evaluate(expression),
      readLatestVisibleAgentLifecycleState(databasePath),
    ]);
    if (uiComplete && lifecycleState?.status === 'completed') return;
    if (lifecycleState?.status === 'failed') {
      throw new Error(`Visible Desktop Agent turn failed: ${lifecycleState.diagnostic}`);
    }
    await delay(100);
  }
  const [uiState, lifecycleState] = await Promise.all([
    inspectProviderWaitState(evaluate),
    readLatestVisibleAgentLifecycleState(databasePath),
  ]);
  throw new Error(
    'Visible Desktop Agent did not render a completed provider response and active sidebar ' +
      `conversation: ${JSON.stringify({ uiState, lifecycleState })}`,
  );
}

export async function readLatestVisibleAgentLifecycleState(databasePath) {
  const sqlite = await import('node:sqlite');
  let database;
  try {
    database = new sqlite.DatabaseSync(databasePath, { readOnly: true, timeout: 1_000 });
  } catch {
    return undefined;
  }
  try {
    const lifecycleTable = database
      .prepare(
        `SELECT name
           FROM sqlite_master
          WHERE type = 'table' AND name = 'agent_conversation_records'`,
      )
      .get();
    if (!lifecycleTable) return undefined;
    const row = database
      .prepare(
        `SELECT payload_json
           FROM agent_conversation_records
          ORDER BY rowid DESC
          LIMIT 1`,
      )
      .get();
    if (!row || typeof row.payload_json !== 'string') return undefined;
    const snapshot = JSON.parse(row.payload_json);
    const pendingTurn = snapshot?.pendingTurn;
    if (!pendingTurn || typeof pendingTurn.status !== 'string') return undefined;
    return {
      conversationId:
        typeof snapshot.conversationId === 'string' ? snapshot.conversationId : undefined,
      turnId: typeof pendingTurn.turnId === 'string' ? pendingTurn.turnId : undefined,
      status: pendingTurn.status,
      diagnostic: typeof pendingTurn.diagnostic === 'string' ? pendingTurn.diagnostic : undefined,
    };
  } finally {
    database.close();
  }
}

async function inspectProviderWaitState(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    ${requireActiveWorkbenchProjection('projection')}
    const context = activeWorkbench.scene.context;
    const conversationId = context.kind === 'agent' && context.scope.kind !== 'unbound'
      ? context.scope.conversationId
      : undefined;
    const summary = conversationId === undefined
      ? undefined
      : projection.agentHome.conversations.find(
          (conversation) => conversation.navigation.conversationId === conversationId,
        );
    return {
      contextKind: context.kind,
      scopeKind: context.kind === 'agent' ? context.scope.kind : undefined,
      conversationId,
      ownerKind: summary?.navigation.owner.kind,
      lastActivityKind: summary?.lastActivity.kind,
      activeConversationVisible: Boolean(document.querySelector(
        '.primary-conversation-group[data-group-kind="assistant"] ' +
          '.primary-recent-conversation-row[data-active="true"] .home-conversation-link',
      )),
      transcriptActivity: document.querySelector(
        '[data-owner-root="agent"] .agent-message-list .agent-execution-activity',
      )?.textContent?.trim() ?? undefined,
      sawTranscriptActivity:
        window.__openNekoAgentProviderUiObservation?.sawTranscriptActivity === true,
      composerAvailable: Boolean(document.querySelector('.agent-composer-textarea')),
      stopControlVisible: Boolean(document.querySelector('.agent-composer-stop')),
      visibleMessages: [...document.querySelectorAll(
        '[data-owner-root="agent"] .agent-message-row',
      )].map((row) => row.textContent?.trim() ?? '').filter(Boolean),
      alerts: [...document.querySelectorAll('[role="alert"]')]
        .map((element) => element.textContent?.trim() ?? '')
        .filter(Boolean),
    };
  })()`);
}

function requireActiveWorkbenchProjection(projectionName) {
  return `const activeWorkbench = ${projectionName}.window.workbench;`;
}

function requireEnvironmentIdentity(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw infrastructureBlocker(`Visible Desktop Agent ${label} authorization is missing.`);
  }
  return value.trim();
}

function infrastructureBlocker(message, cause) {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), {
    code: 'infrastructure-blocked',
  });
}
