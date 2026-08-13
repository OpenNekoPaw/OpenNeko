import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parse as parseToml } from 'smol-toml';
import { openFixtureWorkspace } from '../../desktop-functional/desktop-operations.mjs';
import {
  clickApplicationNavigation,
  recoverFixtureProjectMediaLibrary,
  registerFixtureGlobalMediaLibrary,
} from '../../desktop-functional/desktop-workbench-scenes.mjs';
import { evaluateArtifactChecks } from '../runner/artifact-checks.mjs';
import { createDesktopAgentDriver } from './driver.mjs';
import { requiresOpenNekoResourceObservation } from './evidence.mjs';
import { executeDesktopAgentWorkflow } from './workflow.mjs';

const ACTIVE_AGENT_SURFACE_SELECTOR = '[data-primary-surface="agent"]';
const ACTIVE_AGENT_TEXTAREA_SELECTOR = `${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-textarea`;
const ACTIVE_AGENT_SEND_SELECTOR = `${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-composer-send`;
const ACTIVE_AGENT_APPROVE_SELECTOR = `${ACTIVE_AGENT_SURFACE_SELECTOR} .agent-inline-card.is-warning .neko-button:not(.neko-button-secondary)`;
const DEVELOPMENT_RENDERER_STABILITY_MS = 6_000;

export function createDesktopAgentEvaluationScenario(executionCase, authorization) {
  const mediaObservationRequired = requiresOpenNekoResourceObservation(executionCase.assertions);
  return Object.freeze({
    id: `agent-eval-${executionCase.caseId}`,
    owner: '@neko/agent-runtime',
    async prepare({ fixtureHome, repositoryRoot }) {
      const workspacePath = join(fixtureHome, 'workspace');
      const fixtureSource = resolve(
        repositoryRoot,
        'scripts',
        'agent-eval',
        executionCase.fixture.root,
      );
      await cp(fixtureSource, workspacePath, { recursive: true, errorOnExist: true });
      const mediaLibrary = executionCase.fixture.mediaLibrary;
      if (mediaLibrary) {
        if (mediaLibrary.libraryName !== 'workspace') {
          throw infrastructureBlocker(
            "Desktop Agent Evaluation currently owns one exact functional Media Library picker identity: 'workspace'.",
          );
        }
        const source = resolve(workspacePath, mediaLibrary.source);
        const target = join(fixtureHome, 'global-media', mediaLibrary.libraryName);
        await mkdir(join(fixtureHome, 'global-media'), { recursive: true });
        await cp(source, target, { recursive: true, errorOnExist: true });
        await rm(source, { recursive: true, force: true });
      }
      const configText = await readAuthorizedConfiguration(authorization);
      await mkdir(join(fixtureHome, '.neko'), { recursive: true });
      await writeFile(join(fixtureHome, '.neko', 'config.toml'), configText, {
        encoding: 'utf8',
        mode: 0o600,
      });
      return {
        workspacePath,
        providerId: authorization.providerId,
        modelId: authorization.modelId,
      };
    },
    async run({
      prepared,
      evaluate,
      waitForSelector,
      click,
      type,
      waitForDesktopBridge,
      restartApplication,
      checkpoint,
      readOpenNekoResourceRequests,
    }) {
      const startSurface = executionCase.execution?.startSurface ?? 'workspace';
      let mediaLibrarySetup;
      if (executionCase.fixture.mediaLibrary) {
        if (startSurface !== 'workspace') {
          throw infrastructureBlocker(
            'Desktop Agent Media Library Evaluation requires the Workspace start surface.',
          );
        }
        const mediaLibrary = executionCase.fixture.mediaLibrary;
        const registered = await registerFixtureGlobalMediaLibrary({
          evaluate,
          click,
          waitForSelector,
          libraryName: mediaLibrary.libraryName,
        });
        await clickApplicationNavigation(evaluate, click, 0);
        await waitForSelector(
          `.desktop-scene-workbench--agent-only ${ACTIVE_AGENT_TEXTAREA_SELECTOR}`,
        );
        mediaLibrarySetup = { mediaLibrary, registered };
      }
      const opened =
        startSurface === 'workspace' ? await openFixtureWorkspace(evaluate) : undefined;
      await waitForSelector('[data-owner-root="agent"]', 30_000);
      if (mediaLibrarySetup) {
        const recovery = await recoverFixtureProjectMediaLibrary({
          evaluate,
          waitForSelector,
          libraryName: mediaLibrarySetup.mediaLibrary.libraryName,
          expectedContentLabel: mediaLibrarySetup.mediaLibrary.contentLabel,
        });
        mediaLibrarySetup = { ...mediaLibrarySetup, recovery };
      }
      await waitForStableDesktopAgentRenderer({
        evaluate,
        waitForDesktopBridge,
        waitForSelector,
      });
      const driver = createDesktopAgentDriver({
        evaluate,
        waitForRenderer: async () => {
          await waitForDesktopBridge(30_000);
          await waitForSelector('[data-owner-root="agent"]', 30_000);
        },
        restartApplication,
      });
      const visible = executionCase.execution?.evidenceLevel === 'visible-desktop';
      if (startSurface === 'entry' && !visible) {
        throw infrastructureBlocker(
          'Entry Draft Evaluation requires visible Desktop controls before Session materialization.',
        );
      }
      const initialInteraction = await readActiveAgentInteraction(evaluate);
      const connected =
        startSurface === 'workspace'
          ? await driver.connect(resolveWorkspaceAgentOwner(opened))
          : undefined;
      const workflowDriver = createScenarioWorkflowDriver({
        driver,
        connection: connected?.connection,
        visible,
        evaluate,
        waitForSelector,
        click,
        type,
      });
      const conversation = visible ? undefined : await driver.createConversation();
      if (conversation) {
        checkpoint('agent-conversation-created', { conversationId: conversation.conversationId });
      }
      const workflow = await executeDesktopAgentWorkflow({
        driver: workflowDriver,
        conversationId: conversation?.conversationId,
        steps: executionCase.steps,
        modelProfiles: executionCase.modelProfiles,
        defaultTimeoutMs: executionCase.budget.timeoutMs,
        checkpoint,
      });
      const conversationId = workflow.conversationId;
      const identity = workflow.terminalIdle.identity;
      const finalInteraction = await readActiveAgentInteraction(evaluate);
      let resumed = await driver.resume({
        conversationId,
        timeoutMs: executionCase.budget.timeoutMs,
      });
      const projection = await driver.readProjection(conversationId);
      const pendingFacts = await driver.readFacts(identity);
      const lifecycle = {};
      if (executionCase.execution?.lifecycleChecks?.includes('renderer-reload')) {
        const restored = await driver.reloadAndRestore({
          connection: workflowDriver.getConnection(),
          conversationId,
          timeoutMs: executionCase.budget.timeoutMs,
        });
        workflowDriver.setConnection(restored.connection);
        resumed = { accepted: true, snapshot: restored.snapshot };
        lifecycle.rendererReload = {
          status: 'restored',
          connection: restored.connection,
        };
      }
      if (executionCase.execution?.lifecycleChecks?.includes('composer-focus')) {
        await click('[data-owner-root="agent"] .agent-composer-textarea');
        const focused = await evaluate(
          `document.activeElement?.matches('[data-owner-root="agent"] .agent-composer-textarea') === true`,
        );
        if (focused !== true)
          throw new Error('Desktop Agent composer did not retain visible focus.');
        lifecycle.composerFocus = { status: 'focused' };
      }
      const mediaCard = mediaObservationRequired
        ? await waitForPackageOwnedMediaCard(evaluate, readOpenNekoResourceRequests, 30_000)
        : undefined;
      if (mediaCard) checkpoint('agent-package-media-card-rendered', mediaCard);
      const openNekoResourceRequestCount = readOpenNekoResourceRequests().length;
      const artifactChecks = await evaluateArtifactChecks(executionCase.artifactChecks, {
        workspace: prepared.workspacePath,
        facts: pendingFacts.facts,
      });
      const closed = await driver.closeApplication();
      if (closed.status !== 'facts') {
        throw new Error('Desktop Agent close did not return final disposal facts.');
      }
      if (executionCase.execution?.lifecycleChecks?.includes('graceful-close')) {
        lifecycle.gracefulClose = { status: 'disposed' };
      }
      return {
        conversationId,
        identity,
        projection,
        snapshot: resumed.snapshot,
        facts: closed.facts,
        workflow,
        artifactChecks,
        mediaObservationRequired,
        openNekoResourceRequestCount,
        mediaCard,
        lifecycle,
        interaction: {
          initial: initialInteraction,
          final: finalInteraction,
        },
        ...(mediaLibrarySetup ? { mediaLibrarySetup } : {}),
      };
    },
  });
}

export async function waitForStableDesktopAgentRenderer(input) {
  const stabilityMs = input.stabilityMs ?? DEVELOPMENT_RENDERER_STABILITY_MS;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const now = input.now ?? Date.now;
  const wait = input.delay ?? delay;
  const deadline = now() + timeoutMs;
  let timeOrigin;
  let stableSince = now();
  while (now() < deadline) {
    try {
      await input.waitForDesktopBridge(Math.min(timeoutMs, 5_000));
      await input.waitForSelector('[data-owner-root="agent"]', Math.min(timeoutMs, 5_000));
      const currentTimeOrigin = await input.evaluate('performance.timeOrigin');
      if (typeof currentTimeOrigin !== 'number' || !Number.isFinite(currentTimeOrigin)) {
        throw new Error('Desktop Renderer has no stable page time origin.');
      }
      if (currentTimeOrigin !== timeOrigin) {
        timeOrigin = currentTimeOrigin;
        stableSince = now();
      } else if (now() - stableSince >= stabilityMs) {
        return;
      }
    } catch {
      timeOrigin = undefined;
      stableSince = now();
    }
    await wait(100);
  }
  throw new Error('Desktop Agent Renderer did not remain stable before driver injection.');
}

function resolveWorkspaceAgentOwner(opened) {
  const workbench = opened.projection.window.workbench;
  const interaction = workbench.scene.slots.interaction;
  if (!interaction) {
    throw new Error('Desktop Agent Evaluation has no exact active Agent Surface.');
  }
  return {
    workbenchInstanceId: workbench.workbenchInstanceId,
    agentSurfaceId: interaction.agentSurfaceId,
    projectId: opened.project.projectId,
    viewId: opened.tab.viewId,
  };
}

function createScenarioWorkflowDriver(input) {
  let connection = input.connection;
  return Object.freeze({
    ...input.driver,
    getConnection: () => connection,
    setConnection: (next) => {
      connection = next;
    },
    async submit(command) {
      if (!input.visible) return input.driver.submit(command);
      if (command.contextPayloads !== undefined) {
        throw new Error(
          'Visible Desktop Agent submission does not support hidden context injection.',
        );
      }
      const eventOffset = connection ? (await input.driver.markEventOffset()).eventOffset : 0;
      await input.type(ACTIVE_AGENT_TEXTAREA_SELECTOR, command.prompt);
      await waitForCondition(
        input.evaluate,
        `(() => {
          const button = document.querySelector(${JSON.stringify(ACTIVE_AGENT_SEND_SELECTOR)});
          return button instanceof HTMLButtonElement && !button.disabled;
        })()`,
        'Visible Desktop Agent composer did not enable its send control.',
      );
      await input.click(ACTIVE_AGENT_SEND_SELECTOR);
      let conversationId = command.conversationId;
      if (!connection) {
        const owner = await waitForActiveAgentSession(input.evaluate, command.timeoutMs ?? 30_000);
        const connected = await input.driver.connect(owner);
        connection = connected.connection;
        conversationId = owner.conversationId;
      } else if (conversationId === undefined) {
        conversationId = (
          await input.driver.waitForActiveConversation(eventOffset, command.timeoutMs ?? 30_000)
        ).conversationId;
      }
      return { accepted: true, eventOffset, conversationId };
    },
    async confirm(command) {
      if (!input.visible) return input.driver.confirm(command);
      await input.waitForSelector(ACTIVE_AGENT_APPROVE_SELECTOR, 30_000);
      const confirmation = await input.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ACTIVE_AGENT_SURFACE_SELECTOR)});
        const cards = [...(root?.querySelectorAll('.agent-inline-card.is-warning') ?? [])];
        const matches = cards.filter(
          (card) => card.querySelector('.agent-badge')?.textContent?.trim() === ${JSON.stringify(command.toolName)},
        );
        return { cardCount: cards.length, matchingToolCount: matches.length };
      })()`);
      if (confirmation?.cardCount !== 1 || confirmation.matchingToolCount !== 1) {
        throw new Error('Visible Desktop Agent approval control is not bound to one exact Tool.');
      }
      await input.click(ACTIVE_AGENT_APPROVE_SELECTOR);
      return {
        accepted: true,
        identity: {
          conversationId: command.conversationId,
          turnId: command.turnId,
          runId: command.runId,
        },
        toolCallId: command.toolCallId,
      };
    },
    async restart(command) {
      const restored = await input.driver.restartAndRestore({
        connection,
        conversationId: command.conversationId,
        timeoutMs: command.timeoutMs,
      });
      connection = restored.connection;
      return { accepted: true, connection, snapshot: restored.snapshot };
    },
  });
}

async function waitForActiveAgentSession(evaluate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const interaction = await readActiveAgentInteraction(evaluate);
    if (
      interaction.phase === 'session' &&
      interaction.bindingKind === 'assistant' &&
      typeof interaction.assistantSpaceId === 'string' &&
      typeof interaction.conversationId === 'string'
    ) {
      return {
        workbenchInstanceId: interaction.workbenchInstanceId,
        agentSurfaceId: interaction.agentSurfaceId,
        assistantSpaceId: interaction.assistantSpaceId,
        conversationId: interaction.conversationId,
        viewId: interaction.agentViewId,
      };
    }
    await delay(50);
  }
  throw new Error('Visible Entry Draft did not materialize an Assistant Session.');
}

async function readActiveAgentInteraction(evaluate) {
  return evaluate(`(async () => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    const workbench = projection.window.workbench;
    const interaction = workbench?.scene?.slots?.interaction;
    const context = workbench?.scene?.context;
    if (!interaction || interaction.kind !== 'agent' || context?.kind !== 'agent') {
      throw new Error('Desktop Agent Evaluation has no active Agent interaction.');
    }
    const scope = context.scope;
    return {
      workbenchInstanceId: workbench.workbenchInstanceId,
      agentSurfaceId: interaction.agentSurfaceId,
      agentViewId: context.agentViewId,
      phase: interaction.phase,
      bindingKind: scope.kind,
      draftId: scope.draftId,
      ...(scope.assistantSpaceId === undefined ? {} : { assistantSpaceId: scope.assistantSpaceId }),
      ...(scope.workspaceId === undefined ? {} : { workspaceId: scope.workspaceId }),
      ...(scope.workspaceGrantId === undefined ? {} : { workspaceGrantId: scope.workspaceGrantId }),
      ...(scope.conversationId === undefined ? {} : { conversationId: scope.conversationId }),
    };
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

export async function readAuthorizedConfiguration(authorization) {
  const configText = await readFile(authorization.configurationFile, 'utf8').catch(() => {
    throw authorizationError(
      'Authorized Desktop Agent configuration ~/.neko/config.toml is unavailable.',
    );
  });
  return validateAuthorizedUserConfiguration(configText, authorization);
}

export function validateAuthorizedUserConfiguration(configText, authorization) {
  let parsed;
  try {
    parsed = parseToml(configText);
  } catch {
    throw authorizationError('Authorized Desktop Agent configuration TOML is invalid.');
  }
  const declaredConfiguration = JSON.stringify(parsed);
  if (
    !declaredConfiguration.includes(authorization.providerId) ||
    !declaredConfiguration.includes(authorization.modelId)
  ) {
    throw authorizationError(
      'Authorized Desktop Agent configuration does not declare the approved provider/model identity.',
    );
  }
  return configText;
}

async function waitForPackageOwnedMediaCard(evaluate, readRequests, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const card = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-root="agent"]');
      const image = root?.querySelector('[data-testid="tool-produced-outputs"] img[src^="openneko://resource/"]');
      return image instanceof HTMLImageElement
        ? { owner: root?.getAttribute('data-owner-root'), tag: image.tagName, loaded: image.complete && image.naturalWidth > 0 }
        : undefined;
    })()`);
    if (card?.owner === 'agent' && card.tag === 'IMG' && card.loaded === true) {
      const requests = readRequests();
      if (requests.length > 0) return { ...card, openNekoRequestCount: requests.length };
    }
    await delay(50);
  }
  throw new Error('Package-owned Agent media card did not render an OpenNeko image.');
}

function authorizationError(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}

function infrastructureBlocker(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}
