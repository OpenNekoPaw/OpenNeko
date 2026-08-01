import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openFixtureWorkspace } from '../../desktop-functional/desktop-operations.mjs';
import { createDesktopAgentDriver } from './driver.mjs';

export function createDesktopAgentEvaluationScenario(selection, authorization) {
  const fixture = readSingleFixture(selection);
  const execution = readSingleTurnExecution(selection.scenario);
  return Object.freeze({
    id: `agent-eval-${selection.scenario.id}`,
    owner: 'neko-agent-evaluation',
    async prepare({ fixtureHome, repositoryRoot }) {
      const workspacePath = join(fixtureHome, 'workspace');
      const fixtureSource = resolve(repositoryRoot, 'scripts', 'agent-eval', fixture.root);
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
    async run({ evaluate, waitForSelector, checkpoint, readOpenNekoResourceRequests }) {
      const opened = await openFixtureWorkspace(evaluate);
      await waitForSelector('[data-owner-root="agent"]', 30_000);
      const driver = createDesktopAgentDriver({ evaluate });
      await driver.connect({
        projectId: opened.project.projectId,
        viewId: opened.tab.viewId,
        viewEpoch: opened.tab.viewEpoch,
      });
      const conversation = await driver.createConversation();
      checkpoint('agent-conversation-created', { conversationId: conversation.conversationId });
      await driver.submit({
        conversationId: conversation.conversationId,
        prompt: execution.prompt,
      });
      const idle = await driver.waitForIdle(conversation.conversationId, execution.timeoutMs);
      checkpoint('agent-terminal-idle', { identity: idle.identity });
      const projection = await driver.readProjection(conversation.conversationId);
      const pendingFacts = await driver.readFacts(idle.identity);
      assertFactsContainNoRenderUrl(pendingFacts.facts);
      const mediaCard = await waitForPackageOwnedMediaCard(
        evaluate,
        readOpenNekoResourceRequests,
        30_000,
      );
      checkpoint('agent-package-media-card-rendered', mediaCard);
      const closed = await driver.closeApplication();
      if (closed.status !== 'facts') {
        throw new Error('Desktop Agent close did not return final disposal facts.');
      }
      assertFactsContainNoRenderUrl(closed.facts);
      assertLocatorDisplayProjectionEvidence({
        facts: closed.facts,
        projection,
        identity: idle.identity,
        authorization,
      });
      return {
        conversationId: conversation.conversationId,
        identity: idle.identity,
        projection,
        facts: closed.facts,
        mediaCard,
      };
    },
    assertObservation(observed, evidence) {
      if (observed.openNekoResourceRequestCount < 1) {
        throw new Error('Desktop Agent media card did not reach the OpenNeko resource handler.');
      }
      if (evidence.facts.disposal.status !== 'disposed') {
        throw new Error('Desktop Agent complete-session resources were not disposed.');
      }
    },
  });
}

function readSingleFixture(selection) {
  if (selection.scenario.fixtureRefs.length !== 1) {
    throw configurationError('Desktop Agent sample requires exactly one fixture.');
  }
  const fixtureId = selection.scenario.fixtureRefs[0];
  const fixture = selection.suite.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) throw configurationError(`Desktop Agent fixture '${fixtureId}' is unavailable.`);
  return fixture;
}

function readSingleTurnExecution(scenario) {
  const submit = scenario.steps.filter((step) => step.kind === 'submit');
  const idle = scenario.steps.filter((step) => step.kind === 'wait-for-idle');
  const unsupported = scenario.steps.filter(
    (step) => step.kind !== 'submit' && step.kind !== 'wait-for-idle',
  );
  if (submit.length !== 1 || idle.length !== 1 || unsupported.length > 0) {
    throw configurationError(
      'Desktop Agent M1 sample supports exactly one submit followed by one wait-for-idle step.',
    );
  }
  const prompt = submit[0]?.prompt;
  const timeoutMs = idle[0]?.timeoutMs ?? scenario.budget.timeoutMs;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw configurationError('Desktop Agent sample prompt is unavailable.');
  }
  return { prompt, timeoutMs };
}

async function readAuthorizedConfiguration(authorization) {
  const configText = await readFile(authorization.configurationFile, 'utf8');
  const placeholder = `\${${authorization.credentialEnvName}}`;
  if (!configText.includes(placeholder)) {
    throw authorizationError(
      `Authorized Desktop Agent configuration must reference ${placeholder} instead of embedding a credential.`,
    );
  }
  if (
    !configText.includes(authorization.providerId) ||
    !configText.includes(authorization.modelId)
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

function assertFactsContainNoRenderUrl(facts) {
  const serialized = JSON.stringify(facts);
  if (
    /openneko:\/\/resource\/|neko-media:|opennekomedia:|file:|https?:\/\/(?:127\.0\.0\.1|localhost)/u.test(
      serialized,
    )
  ) {
    throw new Error('Desktop Agent provider/Tool facts contain a render transport URL.');
  }
}

function assertLocatorDisplayProjectionEvidence(input) {
  const facts = input.facts;
  if (
    facts.identity.conversationId !== input.identity.conversationId ||
    facts.identity.turnId !== input.identity.turnId ||
    facts.identity.runId !== input.identity.runId
  ) {
    throw new Error('Desktop Agent terminal facts identity is stale or mismatched.');
  }
  if (
    facts.configuration.effective.values.modelBinding.providerId !==
      input.authorization.providerId ||
    facts.configuration.effective.values.modelBinding.modelId !== input.authorization.modelId
  ) {
    throw new Error('Desktop Agent effective provider/model differs from the approved identity.');
  }
  if (
    facts.runtimePath.controller !== 'sender-bound-desktop-agent-controller' ||
    facts.runtimePath.runtime !== 'pi-conversation-runtime' ||
    facts.runtimePath.transcript !== 'pi-session' ||
    facts.runtimePath.metadata !== 'sqlite' ||
    facts.runtimePath.projection !== 'conversation-projection-store' ||
    facts.runtimePath.forbiddenPathCount !== 0
  ) {
    throw new Error(
      'Desktop Agent terminal facts did not use the canonical complete-session path.',
    );
  }
  if (
    facts.projection.terminalState !== 'completed' ||
    facts.persistence.checkpoint !== 'observed' ||
    facts.disposal.status !== 'disposed'
  ) {
    throw new Error(
      'Desktop Agent terminal projection, persistence or disposal facts are incomplete.',
    );
  }
  const tool = facts.receipts.tools.items.find(
    (candidate) => candidate.name === 'ReadImage' && candidate.status === 'success',
  );
  if (!tool?.callId) throw new Error('Desktop Agent ReadImage success receipt is unavailable.');
  const display = facts.resourceDisplayProjections.items.find(
    (candidate) =>
      candidate.toolCallId === tool.callId &&
      candidate.projectionKind === 'tool-result' &&
      candidate.status === 'authorized' &&
      candidate.locatorKind === 'workspace-file' &&
      candidate.transport === 'openneko-resource' &&
      candidate.renderTarget === 'agent-webview' &&
      candidate.diagnosticCodes.length === 0,
  );
  if (!display) {
    throw new Error('Desktop Agent authorized locator-backed display projection is unavailable.');
  }
  const incomplete = [
    ...Object.values(facts.receipts),
    facts.resourceDisplayProjections,
    facts.diagnostics,
  ].filter((collection) => collection.droppedCount !== 0);
  if (incomplete.length > 0) throw new Error('Desktop Agent required facts were truncated.');
  if (facts.diagnostics.items.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error('Desktop Agent terminal facts contain a runtime error diagnostic.');
  }
  const projected = JSON.stringify(input.projection);
  if (
    !projected.includes('ReadImage') ||
    !projected.includes('station-illustration.svg') ||
    !projected.includes('LOCATOR_DISPLAY_PROJECTION_OK')
  ) {
    throw new Error(
      'Desktop Agent public Timeline projection is missing Tool, locator or final marker.',
    );
  }
  if (/ResourceRef|resourceRef|neko-media:|opennekomedia:|file:/u.test(projected)) {
    throw new Error('Desktop Agent public Timeline projection used a forbidden media fallback.');
  }
}

function authorizationError(message) {
  return Object.assign(new Error(message), { code: 'infrastructure-blocked' });
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}
