import { realpath, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  CdpSession,
  listCdpTargets,
  selectCdpTarget,
  waitForCdpTarget,
} from './cdp-session.mjs';
import { waitForHostController } from './host-controller-client.mjs';

export const DEFAULT_VSCODE_DEBUG_PORT = 9222;
export const DEFAULT_CONTROLLER_CONNECTION_FILE = '.tmp/webview-functional-controller.json';

export class VSCodeFunctionalHost {
  constructor(options) {
    this.options = options;
    this.runtimeEvents = [];
    this.sessions = [];
    this.hostObservations = [];
  }

  async start() {
    const testWorkspaceRoot = await resolveExistingDirectory(
      this.options.testWorkspaceRoot,
      'VS Code built-in Debug workspace',
    );
    const fixtureRoot = await resolveExistingDirectory(
      this.options.fixtureRoot,
      'functional fixture root',
    );
    assertPathInsideOrEqual(fixtureRoot, testWorkspaceRoot, 'Functional fixture root');

    const debugPort = this.options.debugPort ?? DEFAULT_VSCODE_DEBUG_PORT;
    assertDebugPort(debugPort);
    const connectionFile = resolve(
      this.options.repoRoot,
      this.options.controllerFile ?? DEFAULT_CONTROLLER_CONNECTION_FILE,
    );
    this.connectionFile = connectionFile;
    this.debugPort = debugPort;

    try {
      const [pageTarget, controller] = await Promise.all([
        waitForCdpTarget(
          debugPort,
          { type: 'page', titleIncludes: 'neko-test' },
          this.options.startupTimeoutMs,
        ),
        waitForHostController(connectionFile, undefined, this.options.startupTimeoutMs),
      ]);
      this.controller = controller;

      const ping = await controller.execute('ping', {});
      const observedWorkspaceRoot = await resolveExistingDirectory(
        ping.workspaceRoot,
        'attached Debug Host workspace',
      );
      if (observedWorkspaceRoot !== testWorkspaceRoot) {
        const error = new Error(
          `Attached Debug Host workspace mismatch: expected ${testWorkspaceRoot}, received ${observedWorkspaceRoot}. Start the dedicated built-in Debug configuration before running scenarios.`,
        );
        error.failureClassification = 'configuration';
        throw error;
      }

      await controller.execute('configure-fixture-root', { path: fixtureRoot });
      await controller.execute('clear-observations', {});
      const extensionIdentity = await controller.execute('host-identity', {
        extensionIds: this.options.scenario.extensions.map((extension) => extension.id),
      });
      if (extensionIdentity.workspaceRoot !== testWorkspaceRoot) {
        const error = new Error(
          `Functional controller identity reported the wrong workspace: ${extensionIdentity.workspaceRoot}.`,
        );
        error.failureClassification = 'configuration';
        throw error;
      }
      if (
        this.options.expectedVSCodeVersion &&
        extensionIdentity.version !== this.options.expectedVSCodeVersion
      ) {
        const error = new Error(
          `VS Code Debug Host version mismatch: expected ${this.options.expectedVSCodeVersion}, received ${extensionIdentity.version}.`,
        );
        error.failureClassification = 'configuration';
        throw error;
      }
      assertScenarioTargetIdentity(this.options.scenario, extensionIdentity.extensions);

      this.page = new CdpSession(pageTarget);
      await this.page.connect();
      this.page.events.length = 0;
      this.sessions.push(this.page);
      this.identity = {
        kind: 'vscode-built-in-extension-debug-host',
        version: extensionIdentity.version,
        workspaceRoot: testWorkspaceRoot,
        fixtureRoot: relative(testWorkspaceRoot, fixtureRoot),
        debugPort,
        controllerPid: controller.connection.pid,
        extensionIds: this.options.scenario.extensions.map((extension) => extension.id),
        extensions: extensionIdentity.extensions,
      };
      this.baselineWebviewTargetIds = collectMatchingTargetIds(
        await listCdpTargets(debugPort),
        createWebviewTargetMatcher(this.options.scenario),
      );
      return this;
    } catch (error) {
      await this.stop();
      error.failureClassification ??= 'infrastructure';
      throw error;
    }
  }

  async activate() {
    const activation = this.options.scenario.activation;
    if (activation.kind === 'command') {
      return this.controller.execute('execute-command', { command: activation.command, args: [] });
    }
    if (activation.kind === 'open-custom-editor') {
      return this.controller.execute('open-custom-editor', {
        path: activation.path,
        viewType: activation.viewType,
      });
    }
    if (activation.kind === 'open-file-command') {
      await this.controller.execute('open-file', { path: activation.path });
      return this.controller.execute('execute-command', {
        command: activation.command,
        args: [],
      });
    }
    return this.controller.execute('open-file', { path: activation.path });
  }

  async connectWebview(options = {}) {
    const targetMatcher = createWebviewTargetMatcher(this.options.scenario, [
      ...(this.baselineWebviewTargetIds ?? []),
      ...(options.excludeTargetIds ?? []),
    ]);
    const target = await waitForCdpTarget(
      this.debugPort,
      targetMatcher,
      this.options.scenario.timeoutMs,
    );
    if (options.reuseCurrentTarget && this.webview?.target.id === target.id) {
      return this.webview;
    }
    const session = new CdpSession(target, { documentFrame: 'deepest-child' });
    await session.connect();
    this.sessions.push(session);
    this.webview = session;
    return session;
  }

  async execute(action, payload) {
    if (action !== 'reload-window') {
      const value = await this.controller.execute(action, payload);
      if (action === 'hide-reveal') {
        await this.connectWebview({ reuseCurrentTarget: true });
      }
      if (action === 'close-reopen') {
        const previousTargetId = this.webview?.target.id;
        await this.connectWebview({
          excludeTargetIds: previousTargetId ? [previousTargetId] : [],
        });
      }
      return value;
    }

    try {
      await this.#captureControllerObservations();
      const previousControllerPid = this.controller.connection.pid;
      await rm(this.connectionFile, { force: true });
      try {
        await this.controller.execute(action, payload);
      } catch (error) {
        if (!/fetch failed|socket|ECONNRESET|other side closed|abort|timeout|cancel/iu.test(error.message)) {
          throw error;
        }
      }
      for (const session of this.sessions.splice(0)) session.close();
      this.controller = await waitForHostController(
        this.connectionFile,
        undefined,
        this.options.startupTimeoutMs,
        { excludePid: previousControllerPid },
      );
      await this.controller.execute('configure-fixture-root', { path: this.options.fixtureRoot });
      this.baselineWebviewTargetIds = [];
      const pageTarget = await waitForCdpTarget(
        this.debugPort,
        { type: 'page', titleIncludes: 'neko-test' },
        this.options.startupTimeoutMs,
      );
      this.page = new CdpSession(pageTarget);
      await this.page.connect();
      this.sessions.push(this.page);
      await this.connectWebview();
      this.hostObservations.push({
        event: 'host.reload-window',
        source: 'vscode-functional-host',
        observedAt: new Date().toISOString(),
      });
      return { reloaded: true };
    } catch (error) {
      error.failureClassification = 'infrastructure';
      throw error;
    }
  }

  async observations() {
    const current = this.controller ? await this.controller.readObservations() : [];
    return [...this.hostObservations, ...current];
  }

  async stop() {
    await this.controller?.execute('cleanup-session', {}).catch(() => undefined);
    await this.#captureControllerObservations().catch(() => undefined);
    for (const session of this.sessions.splice(0)) session.close();
    this.page = undefined;
    this.webview = undefined;
    this.controller = undefined;
  }

  async cleanup() {
    await rm(this.options.runRoot, { recursive: true, force: true });
  }

  async #captureControllerObservations() {
    if (!this.controller) return;
    this.hostObservations.push(...await this.controller.readObservations());
  }
}

export function collectMatchingTargetIds(targets, matcher) {
  const matchingIds = [];
  const remainingTargets = [...targets];
  while (remainingTargets.length > 0) {
    const target = selectCdpTarget(remainingTargets, matcher);
    if (!target) break;
    matchingIds.push(target.id);
    remainingTargets.splice(remainingTargets.indexOf(target), 1);
  }
  return matchingIds;
}

function createWebviewTargetMatcher(scenario, excludeTargetIds = []) {
  const matcher = {
    ...scenario.target,
    excludeTargetIds: [...new Set(excludeTargetIds)],
  };
  delete matcher.viewType;
  return matcher;
}

function assertScenarioTargetIdentity(scenario, extensions) {
  const viewType = scenario.target.viewType;
  if (!viewType) return;
  const owningExtension = extensions.find((extension) => extension.id === scenario.target.extensionId);
  if (!owningExtension) {
    throw new Error(`Functional target extension is not loaded: ${scenario.target.extensionId}`);
  }
  const declaredViewTypes = scenario.activation.kind === 'open-custom-editor'
    ? owningExtension.customEditorViewTypes
    : owningExtension.webviewViewTypes;
  if (!declaredViewTypes.includes(viewType)) {
    throw new Error(
      `Extension ${owningExtension.id} does not declare functional target ${viewType}.`,
    );
  }
}

export async function validateDebugHostWorkspace(configuredRoot, observedRoot) {
  const expected = await resolveExistingDirectory(configuredRoot, 'configured Debug Host workspace');
  const observed = await resolveExistingDirectory(observedRoot, 'attached Debug Host workspace');
  return { expected, observed, matches: expected === observed };
}

async function resolveExistingDirectory(configuredRoot, label) {
  if (typeof configuredRoot !== 'string' || configuredRoot.length === 0) {
    const error = new Error(`${label} is required.`);
    error.failureClassification = 'configuration';
    throw error;
  }
  try {
    return await realpath(configuredRoot);
  } catch (cause) {
    const error = new Error(`${label} does not exist: ${configuredRoot}`, { cause });
    error.failureClassification = 'configuration';
    throw error;
  }
}

function assertPathInsideOrEqual(candidatePath, rootPath, label) {
  const relativePath = relative(rootPath, candidatePath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    const error = new Error(`${label} must stay inside ${rootPath}: ${candidatePath}`);
    error.failureClassification = 'configuration';
    throw error;
  }
}

function assertDebugPort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error(`VS Code Debug Host CDP port must be an integer from 1 to 65535: ${port}`);
    error.failureClassification = 'configuration';
    throw error;
  }
}
