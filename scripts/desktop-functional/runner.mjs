import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDesktopCdp } from './cdp-client.mjs';
import {
  validateDesktopFunctionalScenario,
  validatePreparedDesktopFixture,
} from './scenario-contract.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const fixturePrefix = 'openneko-desktop-functional-';
const LEGACY_RESOURCE_PATTERNS = Object.freeze([
  'neko-app://*',
  'neko-media://*',
  'opennekomedia://*',
  'http://127.0.0.1:*/v1/resources/*',
  'http://127.0.0.1:*/v1/streams/*',
  'http://127.0.0.1:*/v1/resource-sets/*',
  'http://localhost:*/v1/resources/*',
  'http://localhost:*/v1/streams/*',
  'http://localhost:*/v1/resource-sets/*',
]);

export async function runAutomatedDesktopFunctional(options) {
  const scenario = validateDesktopFunctionalScenario(options.scenario);
  const createTemporaryRoot =
    options.createTemporaryRoot ?? (() => mkdtemp(join(tmpdir(), fixturePrefix)));
  const removeTemporaryRoot =
    options.removeTemporaryRoot ??
    ((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  const temporaryRoot = await createTemporaryRoot();
  const fixtureHome = await (options.resolveFixtureRoot ?? realpath)(temporaryRoot);
  const userDataRoot = join(fixtureHome, 'electron-user-data');
  const reportPath =
    options.reportPath ??
    resolve(
      repositoryRoot,
      'reports',
      'desktop-functional',
      'replace-desktop-media-scheme-with-http-resource-gateway',
      `${new Date().toISOString().replaceAll(':', '-')}-${scenario.id}-${options.target ?? 'development'}`,
      'report.json',
    );
  let processController;
  let cdp;
  let observation;
  let report;
  const checkpoints = [];
  const startedAt = Date.now();
  try {
    await Promise.all([
      mkdir(userDataRoot, { recursive: true }),
      mkdir(dirname(reportPath), { recursive: true }),
    ]);
    const prepared = validatePreparedDesktopFixture(
      await scenario.prepare({ fixtureHome, repositoryRoot }),
      fixtureHome,
    );
    const debugPort = await (options.reservePort ?? reserveTcpPort)();
    const launch = createAutomatedDesktopLaunch({
      platform: options.platform ?? process.platform,
      target: options.target ?? 'development',
      fixtureHome,
      userDataRoot,
      workspacePath: prepared.workspacePath,
      debugPort,
      windowMode: options.windowMode ?? 'visible',
    });
    const platform = options.platform ?? process.platform;
    processController = createProcessController(
      (options.spawnProcess ?? spawn)(launch.command, launch.args, {
        cwd: repositoryRoot,
        env: { ...process.env, ...launch.environment },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: platform !== 'win32',
      }),
      fixtureHome,
      platform,
    );
    cdp = await (options.connectCdp ?? connectDesktopCdp)({
      port: debugPort,
      timeoutMs: options.startupTimeoutMs ?? 60_000,
    });
    await processController.waitForOutput(
      'Desktop renderer loaded.',
      options.startupTimeoutMs ?? 60_000,
    );
    observation = createDesktopObservation(cdp, fixtureHome);
    await observation.start();
    await waitForDesktopBridge(cdp, options.startupTimeoutMs ?? 60_000);
    const version = await cdp.send('Browser.getVersion');
    const scenarioAbort = new AbortController();
    const evidence = await withTimeout(
      scenario.run({
        cdp,
        prepared,
        signal: scenarioAbort.signal,
        checkpoint: (label, detail = {}) => {
          if (typeof label !== 'string' || label.length === 0) {
            throw new Error('Desktop functional checkpoint requires a non-empty label.');
          }
          checkpoints.push({ label, elapsedMs: Date.now() - startedAt, detail });
        },
        evaluate: (expression) => abortable(evaluate(cdp, expression), scenarioAbort.signal),
        click: (selector, index, position) =>
          abortable(clickElement(cdp, selector, index, position), scenarioAbort.signal),
        hover: (selector, index, position) =>
          abortable(hoverElement(cdp, selector, index, position), scenarioAbort.signal),
        waitForSelector: (selector, timeoutMs) =>
          abortable(waitForSelector(cdp, selector, timeoutMs), scenarioAbort.signal),
        readOpenNekoResourceRequests: () => observation.openNekoResourceRequests(),
      }),
      options.scenarioTimeoutMs ?? 120_000,
      `Desktop functional scenario '${scenario.id}'`,
      (error) => scenarioAbort.abort(error),
    );
    const observed = observation.finish();
    if (observed.poisonedRequestCount !== 0) {
      throw new Error(
        `Desktop functional scenario '${scenario.id}' reached ${observed.poisonedRequestCount} poisoned resource request(s).`,
      );
    }
    if (observed.consoleErrors.length !== 0 || observed.exceptions.length !== 0) {
      throw new Error(
        `Desktop functional scenario '${scenario.id}' reported ${String(observed.consoleErrors.length)} console error(s) and ${String(observed.exceptions.length)} exception(s).`,
      );
    }
    scenario.assertObservation?.(observed, evidence);
    report = {
      schema: 'openneko.desktop-functional-report.v1',
      status: 'passed',
      scenario: { id: scenario.id, owner: scenario.owner },
      target: options.target ?? 'development',
      runtime: {
        platform: options.platform ?? process.platform,
        architecture: process.arch,
        browserProduct: version.product,
        userAgent: version.userAgent,
      },
      observation: observed,
      checkpoints,
      evidence,
    };
    await writeReport(reportPath, report, fixtureHome);
    return { reportPath, report };
  } catch (error) {
    report = {
      schema: 'openneko.desktop-functional-report.v1',
      status: 'failed',
      scenario: { id: scenario.id, owner: scenario.owner },
      target: options.target ?? 'development',
      error: redactText(error instanceof Error ? error.message : String(error), fixtureHome),
      observation: observation?.finish(),
      checkpoints,
      process: processController?.snapshot(),
    };
    await writeReport(reportPath, report, fixtureHome);
    throw error;
  } finally {
    if (cdp) {
      try {
        await Promise.race([cdp.send('Browser.close'), delay(1_000)]);
      } catch {
        // The application may already have closed after a fail-visible scenario error.
      }
      cdp.close();
    }
    await processController?.stop();
    await removeTemporaryRoot(temporaryRoot);
  }
}

export function createAutomatedDesktopLaunch(input) {
  const commonArgs = [
    '--openneko-functional-fixture',
    ...(input.windowMode === 'hidden' ? ['--openneko-functional-hidden'] : []),
    `--user-data-dir=${input.userDataRoot}`,
    `--remote-debugging-port=${String(input.debugPort)}`,
  ];
  const environment = Object.freeze({
    OPENNEKO_DESKTOP_FUNCTIONAL_HOME: input.fixtureHome,
    OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE: input.workspacePath,
  });
  if (input.target === 'packaged') {
    return Object.freeze({
      command: packagedExecutable(input.platform),
      args: Object.freeze(commonArgs),
      environment,
    });
  }
  const command = input.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return Object.freeze({
    command,
    args: Object.freeze(['--filter', '@neko/app-desktop', 'dev', '--', ...commonArgs]),
    environment,
  });
}

function createDesktopObservation(cdp, fixtureHome) {
  const requests = [];
  const openNekoResourceRequests = [];
  const requestSurfaces = [];
  const responseMimeTypes = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const exceptions = new Map();
  const disposers = [];
  let finished;
  return {
    async start() {
      disposers.push(
        cdp.on('Network.requestWillBeSent', ({ request }) => {
          if (typeof request?.url === 'string') {
            requests.push(classifyRequest(request.url));
            requestSurfaces.push(classifyRequestSurface(request.url));
            if (request.url.startsWith('openneko://resource/')) {
              openNekoResourceRequests.push(request.url);
            }
          }
        }),
        cdp.on('Network.responseReceived', ({ response }) => {
          if (
            typeof response?.url === 'string' &&
            response.url.startsWith('openneko://resource/') &&
            typeof response.mimeType === 'string'
          ) {
            responseMimeTypes.push(response.mimeType.toLocaleLowerCase());
          }
        }),
        cdp.on('Runtime.consoleAPICalled', (event) => {
          if (event.type !== 'error' && event.type !== 'warning') return;
          const detail = redactText(
            event.args
              ?.map((argument) => String(argument.value ?? argument.description ?? ''))
              .join(' ') ?? '',
            fixtureHome,
          );
          if (event.type === 'error') consoleErrors.push(detail);
          else consoleWarnings.push(detail);
        }),
        cdp.on('Runtime.exceptionThrown', (event) => {
          const exceptionId = event.exceptionDetails?.exceptionId;
          if (typeof exceptionId !== 'number') return;
          exceptions.set(
            exceptionId,
            redactText(
              String(
                event.exceptionDetails?.exception?.description ??
                  event.exceptionDetails?.text ??
                  '',
              ),
              fixtureHome,
            ),
          );
        }),
        cdp.on('Runtime.exceptionRevoked', (event) => {
          if (typeof event.exceptionId === 'number') exceptions.delete(event.exceptionId);
        }),
      );
      await Promise.all([
        cdp.send('Network.enable'),
        cdp.send('Runtime.enable'),
        cdp.send('Page.enable'),
      ]);
      await cdp.send('Network.setBlockedURLs', { urls: LEGACY_RESOURCE_PATTERNS });
    },
    openNekoResourceRequests() {
      return [...openNekoResourceRequests];
    },
    finish() {
      if (finished) return finished;
      for (const dispose of disposers) dispose();
      const counts = Object.fromEntries(
        [...new Set(requests)].map((kind) => [
          kind,
          requests.filter((item) => item === kind).length,
        ]),
      );
      const mimeTypeCounts = Object.fromEntries(
        [...new Set(responseMimeTypes)].map((mimeType) => [
          mimeType,
          responseMimeTypes.filter((item) => item === mimeType).length,
        ]),
      );
      finished = {
        requestCounts: counts,
        requestSurfaces: [...new Set(requestSurfaces)],
        responseMimeTypeCounts: mimeTypeCounts,
        openNekoResourceRequestCount: counts['openneko-resource'] ?? 0,
        pcmResponseCount: mimeTypeCounts['application/vnd.openneko.pcm'] ?? 0,
        poisonedRequestCount: counts['poisoned-resource'] ?? 0,
        consoleErrors,
        consoleWarnings,
        exceptions: [...exceptions.values()],
      };
      return finished;
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const exception = result.exceptionDetails.exception?.description;
    throw new Error(
      `Desktop Renderer evaluation failed: ${String(exception ?? result.exceptionDetails.text ?? 'unknown error')}`,
    );
  }
  return result.result?.value;
}

async function waitForSelector(cdp, selector, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  const expression = `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  const diagnostic = await evaluate(
    cdp,
    `({
      owners: [...document.querySelectorAll('[data-owner-root]')]
        .map((element) => element.getAttribute('data-owner-root')),
      alerts: [...document.querySelectorAll('[role="alert"]')]
        .map((element) => element.textContent?.trim()).filter(Boolean),
      text: document.body.innerText.slice(0, 600),
      url: document.URL,
      readyState: document.readyState,
      html: document.documentElement.outerHTML.slice(0, 600),
    })`,
  );
  throw new Error(
    `Desktop selector '${selector}' was not found before timeout. DOM: ${JSON.stringify(diagnostic)}`,
  );
}

async function waitForDesktopBridge(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      await evaluate(
        cdp,
        `Boolean(window.openNekoDesktop?.shell && window.openNekoDesktop?.projects)`,
      )
    ) {
      return;
    }
    await delay(100);
  }
  const diagnostic = await evaluate(
    cdp,
    `({
      url: document.URL,
      readyState: document.readyState,
      alert: document.querySelector('[role="alert"]')?.textContent?.trim(),
      hasDesktopBridge: typeof window.openNekoDesktop !== 'undefined',
      body: document.body.innerText.slice(0, 600),
    })`,
  );
  throw new Error(
    `Desktop preload bridge was not ready before timeout. DOM: ${JSON.stringify(diagnostic)}`,
  );
}

async function clickElement(cdp, selector, index = 0, position = {}) {
  const point = await waitForElementPoint(cdp, selector, index, position);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

async function hoverElement(cdp, selector, index = 0, position = {}) {
  const point = await waitForElementPoint(cdp, selector, index, position);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 1,
    y: 1,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });
  await delay(50);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });
}

async function waitForElementPoint(cdp, selector, index, position) {
  const deadline = Date.now() + 5_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await resolveElementPoint(cdp, selector, index, position);
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !error.message.includes('is unavailable')) throw error;
      await delay(50);
    }
  }
  throw lastError;
}

async function resolveElementPoint(cdp, selector, index, position) {
  const xRatio = position.xRatio ?? 0.5;
  const yRatio = position.yRatio ?? 0.5;
  if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) {
    throw new Error('Desktop click position ratios must remain between zero and one.');
  }
  const point = await evaluate(
    cdp,
    `(() => {
      const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const element = elements[${String(index)}];
      if (!(element instanceof HTMLElement)) return undefined;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return undefined;
      const x = rect.left + rect.width * ${String(xRatio)};
      const y = rect.top + rect.height * ${String(yRatio)};
      const hit = document.elementFromPoint(x, y);
      return {
        x,
        y,
        hitTarget: hit === element || element.contains(hit),
        hitTag: hit?.tagName,
        hitClass: hit instanceof HTMLElement ? hit.className : undefined,
      };
    })()`,
  );
  if (!point) {
    throw new Error(`Desktop click target '${selector}' at index ${String(index)} is unavailable.`);
  }
  if (!point.hitTarget) {
    throw new Error(
      `Desktop click target '${selector}' is covered by ${String(point.hitTag)}.${String(point.hitClass)}`,
    );
  }
  return point;
}

export function createProcessController(child, fixtureHome, platform, controls = {}) {
  const output = [];
  let exit;
  let launchError;
  const record = (chunk) => {
    const line = redactText(String(chunk), fixtureHome);
    output.push(line);
    if (output.length > 200) output.shift();
  };
  child.stdout?.on('data', record);
  child.stderr?.on('data', record);
  const exited = new Promise((resolveExit) => {
    child.once('error', (error) => {
      launchError = error;
      exit = { code: undefined, signal: undefined };
      resolveExit(exit);
    });
    child.once('exit', (code, signal) => {
      exit = { code, signal };
      resolveExit(exit);
    });
  });
  return {
    snapshot: () => ({
      exit,
      ...(launchError ? { launchError: redactText(launchError.message, fixtureHome) } : {}),
      output: output.join('').slice(-16_000),
    }),
    async waitForOutput(fragment, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (output.join('').includes(fragment)) return;
        if (launchError) throw launchError;
        if (exit) throw new Error(`Desktop process exited before '${fragment}' was reported.`);
        await delay(100);
      }
      throw new Error(`Desktop process did not report '${fragment}' before timeout.`);
    },
    async stop() {
      const killTree = controls.killTree ?? killProcessTree;
      const treeAlive = controls.isTreeAlive ?? isProcessTreeAlive;
      const readExit = () => exit;
      if (!treeAlive(child, platform, readExit)) return;
      killTree(child, platform, 'SIGTERM');
      if (
        await waitForProcessTreeExit(
          child,
          platform,
          readExit,
          treeAlive,
          controls.forceKillAfterMs ?? 3_000,
        )
      ) {
        return;
      }
      killTree(child, platform, 'SIGKILL');
      if (
        !(await waitForProcessTreeExit(
          child,
          platform,
          readExit,
          treeAlive,
          controls.failAfterKillMs ?? 1_000,
        ))
      ) {
        throw new Error('Desktop functional process tree remained alive after SIGKILL.');
      }
      await Promise.race([exited, delay(100)]);
    },
  };
}

async function waitForProcessTreeExit(child, platform, readExit, isAlive, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(child, platform, readExit)) return true;
    await delay(50);
  }
  return !isAlive(child, platform, readExit);
}

function isProcessTreeAlive(child, platform, readExit) {
  if (platform === 'win32') return readExit() === undefined;
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

function killProcessTree(child, platform, signal) {
  if (platform !== 'win32' && Number.isSafeInteger(child.pid) && child.pid > 0) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code === 'ESRCH') return;
      throw error;
    }
  }
  child.kill(signal);
}

function classifyRequest(input) {
  if (input.startsWith('openneko://resource/')) return 'openneko-resource';
  if (input.startsWith('openneko://desktop/')) return 'openneko-desktop';
  if (isPoisonedResourceUrl(input)) return 'poisoned-resource';
  if (input.startsWith('http://localhost:') || input.startsWith('http://127.0.0.1:')) {
    return 'development-http';
  }
  if (input.startsWith('https://')) return 'https';
  return 'other';
}

function classifyRequestSurface(input) {
  try {
    const url = new URL(input);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'invalid-url';
  }
}

function isPoisonedResourceUrl(input) {
  if (/^(?:neko-app|neko-media|opennekomedia):/u.test(input)) return true;
  try {
    const url = new URL(input);
    return (
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      /^\/v1\/(?:resources|streams|resource-sets)(?:\/|$)/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function packagedExecutable(platform) {
  if (platform === 'darwin') {
    return resolve(
      repositoryRoot,
      'apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app/Contents/MacOS/OpenNeko',
    );
  }
  if (platform === 'win32') {
    return resolve(repositoryRoot, 'apps/neko-desktop/out/OpenNeko-win32-x64/OpenNeko.exe');
  }
  throw new Error(`Packaged Desktop functional scenarios do not support '${platform}'.`);
}

async function reserveTcpPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Desktop functional runner did not reserve a TCP port.');
  }
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function writeReport(path, value, fixtureHome) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${redactText(JSON.stringify(value, null, 2), fixtureHome)}\n`);
}

function redactText(value, fixtureHome) {
  return value
    .replaceAll(fixtureHome, '${FIXTURE_HOME}')
    .replaceAll(repositoryRoot, '${REPOSITORY_ROOT}')
    .replace(
      /openneko:\/\/resource\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+/gu,
      'openneko://resource/<redacted>',
    );
}

function withTimeout(promise, milliseconds, label, onTimeout) {
  return new Promise((resolveResult, reject) => {
    const timeout = setTimeout(() => {
      const error = new Error(`${label} exceeded ${String(milliseconds)} ms.`);
      onTimeout?.(error);
      reject(error);
    }, milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolveResult(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolveResult, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolveResult(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
