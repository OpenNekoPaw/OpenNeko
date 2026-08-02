import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import {
  createAutomatedDesktopLaunch,
  createProcessController,
} from '../desktop-functional/runner.mjs';
import {
  validateDesktopFunctionalScenario,
  validatePreparedDesktopFixture,
} from '../desktop-functional/scenario-contract.mjs';

describe('Desktop automated functional runner contract', () => {
  it('launches development Electron with isolated workspace and CDP control', () => {
    const launch = createAutomatedDesktopLaunch({
      platform: 'darwin',
      target: 'development',
      fixtureHome: '/tmp/openneko-desktop-functional-cut',
      userDataRoot: '/tmp/openneko-desktop-functional-cut/electron-user-data',
      workspacePath: '/tmp/openneko-desktop-functional-cut/workspace',
      debugPort: 43123,
    });

    assert.equal(launch.command, 'pnpm');
    assert.deepEqual(launch.args, [
      '--filter',
      '@neko/app-desktop',
      'dev',
      '--',
      '--openneko-functional-fixture',
      '--user-data-dir=/tmp/openneko-desktop-functional-cut/electron-user-data',
      '--remote-debugging-port=43123',
    ]);
    assert.deepEqual(launch.environment, {
      OPENNEKO_DESKTOP_FUNCTIONAL_HOME: '/tmp/openneko-desktop-functional-cut',
      OPENNEKO_DESKTOP_FUNCTIONAL_WORKSPACE: '/tmp/openneko-desktop-functional-cut/workspace',
    });
  });

  it('launches the current native packaged application directly', () => {
    const launch = createAutomatedDesktopLaunch({
      platform: 'darwin',
      target: 'packaged',
      fixtureHome: '/tmp/openneko-desktop-functional-preview',
      userDataRoot: '/tmp/openneko-desktop-functional-preview/electron-user-data',
      workspacePath: '/tmp/openneko-desktop-functional-preview/workspace',
      debugPort: 43124,
    });

    assert.match(
      launch.command,
      /apps\/neko-desktop\/out\/OpenNeko-darwin-arm64\/OpenNeko\.app\/Contents\/MacOS\/OpenNeko$/u,
    );
    assert.deepEqual(launch.args, [
      '--openneko-functional-fixture',
      '--user-data-dir=/tmp/openneko-desktop-functional-preview/electron-user-data',
      '--remote-debugging-port=43124',
    ]);
  });

  it('uses the same isolated Electron launch path for hidden matrix mode', () => {
    const launch = createAutomatedDesktopLaunch({
      platform: 'darwin',
      target: 'packaged',
      fixtureHome: '/tmp/openneko-desktop-functional-agent',
      userDataRoot: '/tmp/openneko-desktop-functional-agent/electron-user-data',
      workspacePath: '/tmp/openneko-desktop-functional-agent/workspace',
      debugPort: 43126,
      windowMode: 'hidden',
    });

    assert.deepEqual(launch.args, [
      '--openneko-functional-fixture',
      '--openneko-functional-hidden',
      '--user-data-dir=/tmp/openneko-desktop-functional-agent/electron-user-data',
      '--remote-debugging-port=43126',
    ]);
  });

  it('keeps scenario ownership and prepared workspaces explicit', () => {
    const scenario = validateDesktopFunctionalScenario({
      id: 'cut-openneko-consumer',
      owner: '@neko/cut-webview',
      prepare() {},
      run() {},
    });
    assert.equal(scenario.owner, '@neko/cut-webview');
    assert.deepEqual(
      validatePreparedDesktopFixture(
        { workspacePath: '/tmp/openneko-desktop-functional-cut/workspace' },
        '/tmp/openneko-desktop-functional-cut',
      ),
      { workspacePath: '/tmp/openneko-desktop-functional-cut/workspace' },
    );
    assert.throws(
      () =>
        validatePreparedDesktopFixture(
          { workspacePath: '/tmp/unrelated-workspace' },
          '/tmp/openneko-desktop-functional-cut',
        ),
      /inside its fixture home/u,
    );
  });

  it('terminates a surviving Desktop process group after its launcher exits', async () => {
    const child = new EventEmitter();
    child.pid = 43125;
    child.stdout = undefined;
    child.stderr = undefined;
    const signals = [];
    let alive = true;
    const controller = createProcessController(
      child,
      '/tmp/openneko-desktop-functional-cut',
      'darwin',
      {
        isTreeAlive: () => alive,
        forceKillAfterMs: 0,
        killTree: (_child, _platform, signal) => {
          signals.push(signal);
          alive = false;
        },
      },
    );

    child.emit('exit', 0, null);
    await controller.stop();

    assert.deepEqual(signals, ['SIGTERM']);
  });

  it('escalates a surviving Desktop process group to SIGKILL', async () => {
    const child = new EventEmitter();
    child.pid = 43126;
    child.stdout = undefined;
    child.stderr = undefined;
    const signals = [];
    let alive = true;
    const controller = createProcessController(
      child,
      '/tmp/openneko-desktop-functional-cut',
      'darwin',
      {
        isTreeAlive: () => alive,
        forceKillAfterMs: 0,
        killTree: (_child, _platform, signal) => {
          signals.push(signal);
          if (signal === 'SIGKILL') alive = false;
        },
      },
    );

    await controller.stop();

    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  });
});
