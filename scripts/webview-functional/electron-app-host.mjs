import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CdpSession, waitForCdpTarget } from './cdp-session.mjs';

const ELECTRON_APPLICATION_REGISTRATIONS = Object.freeze({
  '@neko/app-home': Object.freeze({
    applicationId: 'home',
    rootSegments: ['apps', 'neko-home'],
    workspaceEnvironmentVariable: 'NEKO_HOME_WORKSPACE',
    targetTitle: 'OpenNeko Home',
  }),
});

export function resolveElectronApplicationRegistration(ownerPackage, repoRoot) {
  const registration = ELECTRON_APPLICATION_REGISTRATIONS[ownerPackage];
  if (!registration) {
    throw configurationError(
      `Electron functional application is not registered for owner package: ${ownerPackage}`,
    );
  }
  return {
    ...registration,
    ownerPackage,
    applicationRoot: join(repoRoot, ...registration.rootSegments),
  };
}

export class ElectronApplicationFunctionalHost {
  constructor(options) {
    this.options = options;
    this.runtimeEvents = [];
    this.sessions = [];
    this.hostObservations = [];
  }

  async start() {
    const registration = resolveElectronApplicationRegistration(
      this.options.scenario.ownerPackage,
      this.options.repoRoot,
    );
    const packageJsonPath = join(registration.applicationRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    if (packageJson.name !== registration.ownerPackage) {
      throw configurationError(
        `Electron application package identity mismatch: expected ${registration.ownerPackage}, received ${String(packageJson.name)}`,
      );
    }
    const require = createRequire(packageJsonPath);
    const electronExecutable = require('electron');
    const debugPort = await reservePort();
    const userDataDir = join(
      this.options.runRoot,
      `${registration.applicationId}-user-data`,
    );
    const args = [
      registration.applicationRoot,
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
    ];
    if (process.platform === 'linux') args.push('--no-sandbox');

    this.registration = registration;
    this.process = spawn(electronExecutable, args, {
      cwd: registration.applicationRoot,
      env: {
        ...process.env,
        ...this.options.environment,
        [registration.workspaceEnvironmentVariable]: this.options.fixtureRoot,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    this.process.stdout.on('data', (chunk) => this.#recordMainLog('stdout', chunk));
    this.process.stderr.on('data', (chunk) => this.#recordMainLog('stderr', chunk));
    this.process.once('error', (error) => {
      this.runtimeEvents.push({
        source: 'electron-main',
        applicationId: registration.applicationId,
        level: 'error',
        message: error.message,
      });
    });

    try {
      const expectedTitle = this.options.scenario.target.titleIncludes;
      if (expectedTitle !== registration.targetTitle) {
        throw configurationError(
          `Electron target title mismatch for ${registration.ownerPackage}: expected '${registration.targetTitle}', received '${String(expectedTitle)}'.`,
        );
      }
      const pageTarget = await waitForCdpTarget(
        debugPort,
        { type: 'page', titleIncludes: registration.targetTitle },
        this.options.startupTimeoutMs,
      );
      this.debugPort = debugPort;
      this.page = new CdpSession(pageTarget);
      await this.page.connect();
      this.webview = this.page;
      this.sessions.push(this.page);
      const userAgent = await this.page.evaluate('navigator.userAgent');
      this.identity = {
        kind: 'electron-application-apphost',
        applicationId: registration.applicationId,
        packageName: registration.ownerPackage,
        version: packageJson.version,
        electronUserAgent: userAgent,
        debugPort,
      };
      this.hostObservations.push({
        event: `${registration.applicationId}.apphost.ready`,
        source: `${registration.applicationId}-functional-host`,
        observedAt: new Date().toISOString(),
      });
      return this;
    } catch (error) {
      await this.stop();
      if (!error.failureClassification) error.failureClassification = 'infrastructure';
      throw error;
    }
  }

  async activate() {
    return { launched: true };
  }

  async connectWebview() {
    return this.webview;
  }

  async execute(action) {
    if (action === 'reload-window') {
      await this.page.send('Page.reload', { ignoreCache: true });
      this.hostObservations.push({
        event: `${this.registration.applicationId}.window.reloaded`,
        source: `${this.registration.applicationId}-functional-host`,
        observedAt: new Date().toISOString(),
      });
      return { reloaded: true };
    }
    if (action === 'restart-host') {
      const registration = this.registration;
      await this.stop();
      await this.start();
      this.hostObservations.push({
        event: `${registration.applicationId}.apphost.restarted`,
        source: `${registration.applicationId}-functional-host`,
        observedAt: new Date().toISOString(),
      });
      return { restarted: true };
    }
    if (action === 'ping') return { ready: true };
    throw new Error(
      `Electron host action is not supported by public AppHost boundaries: ${action}`,
    );
  }

  async observations() {
    return [...this.hostObservations];
  }

  async stop() {
    for (const session of this.sessions.splice(0)) session.close();
    if (!this.process || this.process.exitCode !== null) return;
    this.process.kill('SIGTERM');
    const exited = await waitForExit(this.process, 5000);
    if (!exited && this.process.exitCode === null) {
      this.process.kill('SIGKILL');
      await waitForExit(this.process, 2000);
    }
  }

  async cleanup() {
    await rm(this.options.runRoot, { recursive: true, force: true });
  }

  #recordMainLog(stream, chunk) {
    const message = chunk.toString('utf8').trim();
    if (!message) return;
    const isError = stream === 'stderr' && /(?:error|exception|unhandled|failed)/iu.test(message);
    this.runtimeEvents.push({
      source: 'electron-main',
      applicationId: this.registration.applicationId,
      level: isError ? 'error' : 'info',
      message,
      observedAt: new Date().toISOString(),
    });
  }
}

function reservePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to reserve Electron debugger port'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePromise(port)));
    });
  });
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolvePromise) => child.once('exit', () => resolvePromise(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

function configurationError(message) {
  const error = new Error(message);
  error.failureClassification = 'configuration';
  return error;
}
