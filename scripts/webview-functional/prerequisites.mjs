import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function runPrerequisites(
  prerequisites,
  repoRoot,
  platform = process.platform,
  dependencies = {},
) {
  const results = [];
  const environment = {};
  const observations = [];
  const runtimeEvents = [];
  const cleanups = [];
  try {
    for (const prerequisite of prerequisites) {
      if (prerequisite.platforms?.length > 0 && !prerequisite.platforms.includes(platform)) {
        continue;
      }
      if (prerequisite.kind === 'environment-variable') {
        if (!process.env[prerequisite.environmentVariable]) {
          throw infrastructureError(
            `Required environment variable is missing: ${prerequisite.environmentVariable}`,
          );
        }
        results.push({ kind: prerequisite.kind, status: 'available' });
        continue;
      }
      if (prerequisite.kind === 'engine') {
        const engine = await prepareEnginePrerequisite(
          prerequisite,
          repoRoot,
          dependencies,
        );
        Object.assign(environment, engine.environment);
        observations.push(...engine.observations);
        runtimeEvents.push(...engine.runtimeEvents);
        cleanups.push(engine.cleanup);
        results.push(engine.result);
        continue;
      }
      const args = ['--filter', prerequisite.package, 'run', prerequisite.script];
      await runProcess('pnpm', args, repoRoot, dependencies.spawnProcess ?? spawn);
      results.push({
        kind: prerequisite.kind,
        package: prerequisite.package,
        script: prerequisite.script,
      });
    }
  } catch (error) {
    await cleanupAll(cleanups);
    throw error;
  }
  return {
    results,
    environment,
    observations,
    runtimeEvents,
    cleanup: () => cleanupAll(cleanups),
  };
}

async function prepareEnginePrerequisite(prerequisite, repoRoot, dependencies) {
  const port = await (dependencies.reservePort ?? reservePort)();
  const environment = { NEKO_ENGINE_PORT: String(port) };
  const observedAt = new Date().toISOString();
  if (prerequisite.state === 'unavailable') {
    return {
      result: { kind: 'engine', state: 'unavailable', port },
      environment,
      observations: [
        {
          event: 'engine.health.unavailable',
          source: 'webview-functional-prerequisite',
          observedAt,
          port,
        },
      ],
      runtimeEvents: [],
      cleanup: async () => {},
    };
  }

  const executable =
    dependencies.engineExecutable ?? join(repoRoot, 'packages/neko-engine/target/debug/neko-engine');
  await access(executable, constants.X_OK).catch((error) => {
    throw infrastructureError(
      `Real Engine executable is missing or not executable: ${executable}. Run the host-cli build:debug prerequisite first.`,
      error,
    );
  });
  const child = (dependencies.spawnEngine ?? spawn)(
    executable,
    ['serve', '--port', String(port)],
    {
      cwd: join(repoRoot, 'packages/neko-engine'),
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    },
  );
  const runtimeEvents = [];
  let spawnError;
  child.stdout?.on('data', (chunk) => recordEngineLog(runtimeEvents, 'stdout', chunk));
  child.stderr?.on('data', (chunk) => recordEngineLog(runtimeEvents, 'stderr', chunk));
  child.once?.('error', (error) => {
    spawnError = error;
    recordEngineLog(runtimeEvents, 'stderr', error.message);
  });
  const cleanup = () => stopProcess(child);
  try {
    await waitForEngineHealth(
      port,
      child,
      dependencies.fetchHealth ?? fetch,
      dependencies.engineStartupTimeoutMs ?? 30_000,
      () => spawnError,
    );
  } catch (error) {
    await cleanup();
    throw error;
  }
  return {
    result: { kind: 'engine', state: 'ready', port, executable },
    environment,
    observations: [
      {
        event: 'engine.health.ready',
        source: 'webview-functional-prerequisite',
        observedAt: new Date().toISOString(),
        port,
      },
    ],
    runtimeEvents,
    cleanup,
  };
}

function runProcess(command, args, cwd, spawnProcess) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', (error) => reject(infrastructureError(error.message, error)));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(
          infrastructureError(
            `${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit ${code}`}`,
          ),
        );
      }
    });
  });
}

async function waitForEngineHealth(port, child, fetchHealth, timeoutMs, getSpawnError) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const spawnError = getSpawnError();
    if (spawnError) {
      throw infrastructureError(`Unable to start the real Engine: ${spawnError.message}`, spawnError);
    }
    if (child.exitCode !== null) {
      throw infrastructureError(
        `Real Engine exited before health readiness with exit ${child.exitCode}.`,
      );
    }
    try {
      const response = await fetchHealth(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The Engine owns readiness; connection refusal is expected until its HTTP server binds.
    }
    await delay(100);
  }
  throw infrastructureError(`Timed out waiting for real Engine health on port ${port}.`);
}

function reservePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(infrastructureError('Unable to reserve an Engine port'));
        return;
      }
      server.close((error) =>
        error ? reject(infrastructureError(error.message, error)) : resolvePromise(address.port),
      );
    });
  });
}

async function cleanupAll(cleanups) {
  const errors = [];
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Functional prerequisite cleanup failed');
  }
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exitPromise = waitForProcessExit(child, 5_000);
  child.kill('SIGTERM');
  const exited = await exitPromise;
  if (!exited && child.exitCode === null) {
    const forcedExitPromise = waitForProcessExit(child, 2_000);
    child.kill('SIGKILL');
    await forcedExitPromise;
  }
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise(true);
    });
  });
}

function recordEngineLog(runtimeEvents, stream, chunk) {
  const message = chunk.toString('utf8').trim();
  if (!message) return;
  runtimeEvents.push({
    source: 'engine-prerequisite',
    level: stream === 'stderr' && /(?:error|panic|failed)/iu.test(message) ? 'error' : 'info',
    message,
    observedAt: new Date().toISOString(),
  });
}

function infrastructureError(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.failureClassification = 'infrastructure';
  return error;
}
