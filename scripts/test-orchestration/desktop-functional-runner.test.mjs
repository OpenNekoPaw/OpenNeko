import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAutomatedDesktopLaunch } from '../desktop-functional/runner.mjs';
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

  it('keeps scenario ownership and prepared workspaces explicit', () => {
    const scenario = validateDesktopFunctionalScenario({
      id: 'cut-openneko-consumer',
      owner: 'neko-cut-webview',
      prepare() {},
      run() {},
    });
    assert.equal(scenario.owner, 'neko-cut-webview');
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
});
