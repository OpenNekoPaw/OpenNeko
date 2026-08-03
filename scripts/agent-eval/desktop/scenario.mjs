import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parse as parseToml } from 'smol-toml';
import { openFixtureWorkspace } from '../../desktop-functional/desktop-operations.mjs';
import { evaluateArtifactChecks } from '../runner/artifact-checks.mjs';
import { createDesktopAgentDriver } from './driver.mjs';
import { requiresOpenNekoResourceObservation } from './evidence.mjs';
import { executeDesktopAgentWorkflow } from './workflow.mjs';

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
      waitForDesktopBridge,
      restartApplication,
      checkpoint,
      readOpenNekoResourceRequests,
    }) {
      const opened = await openFixtureWorkspace(evaluate);
      await waitForSelector('[data-owner-root="agent"]', 30_000);
      const driver = createDesktopAgentDriver({
        evaluate,
        waitForRenderer: async () => {
          await waitForDesktopBridge(30_000);
          await waitForSelector('[data-owner-root="agent"]', 30_000);
        },
        restartApplication,
      });
      const connected = await driver.connect({
        projectId: opened.project.projectId,
        viewId: opened.tab.viewId,
        viewEpoch: opened.tab.viewEpoch,
      });
      const conversation = await driver.createConversation();
      checkpoint('agent-conversation-created', { conversationId: conversation.conversationId });
      const workflow = await executeDesktopAgentWorkflow({
        driver,
        conversationId: conversation.conversationId,
        steps: executionCase.steps,
        defaultTimeoutMs: executionCase.budget.timeoutMs,
        checkpoint,
      });
      const identity = workflow.terminalIdle.identity;
      let resumed = await driver.resume({
        conversationId: conversation.conversationId,
        timeoutMs: executionCase.budget.timeoutMs,
      });
      const projection = await driver.readProjection(conversation.conversationId);
      const pendingFacts = await driver.readFacts(identity);
      const lifecycle = {};
      if (executionCase.execution?.lifecycleChecks?.includes('renderer-reload')) {
        const restored = await driver.reloadAndRestore({
          connection: connected.connection,
          conversationId: conversation.conversationId,
          timeoutMs: executionCase.budget.timeoutMs,
        });
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
        conversationId: conversation.conversationId,
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
      };
    },
  });
}

async function readAuthorizedConfiguration(authorization) {
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
