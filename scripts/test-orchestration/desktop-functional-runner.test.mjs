import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  captureDesktopScreenshot,
  createAutomatedDesktopLaunch,
  createProcessController,
  dragDesktopElement,
  pressDesktopKey,
  readDesktopRendererResources,
  scrollDesktopElement,
  typeDesktopText,
} from '../desktop-functional/runner.mjs';
import {
  readLatestVisibleAgentLifecycleState,
  resolveVisibleAgentProviderAuthorization,
} from '../desktop-functional/desktop-agent-provider-ui.mjs';
import {
  validateDesktopFunctionalScenario,
  validatePreparedDesktopFixture,
} from '../desktop-functional/scenario-contract.mjs';
import { createDesktopUiFunctionalLaunch } from '../run-desktop-ui-functional.mjs';
describe('Desktop automated functional runner contract', () => {
  it('keeps Agent Evaluation on the shared isolated Desktop runner', async () => {
    const source = await readFile(
      new URL('../agent-eval/runner/run-case.mjs', import.meta.url),
      'utf8',
    );

    assert.match(
      source,
      /import \{ runAutomatedDesktopFunctional \} from '\.\.\/\.\.\/desktop-functional\/runner\.mjs';/u,
    );
    assert.match(
      source,
      /const runDesktop = options\.runDesktop \?\? runAutomatedDesktopFunctional;/u,
    );
  });

  it('requires explicit provider, model, and cost authorization for visible Agent UI', () => {
    assert.deepEqual(
      resolveVisibleAgentProviderAuthorization(
        {
          OPENNEKO_AGENT_EVAL_PROVIDER_ID: 'provider-1',
          OPENNEKO_AGENT_EVAL_MODEL_ID: 'model-1',
          OPENNEKO_AGENT_EVAL_COST_APPROVED: 'true',
        },
        '/Users/fixture',
      ),
      {
        providerId: 'provider-1',
        modelId: 'model-1',
        configurationFile: '/Users/fixture/.neko/config.toml',
      },
    );
    assert.throws(
      () =>
        resolveVisibleAgentProviderAuthorization(
          {
            OPENNEKO_AGENT_EVAL_PROVIDER_ID: 'provider-1',
            OPENNEKO_AGENT_EVAL_MODEL_ID: 'model-1',
            OPENNEKO_AGENT_EVAL_COST_APPROVED: 'false',
          },
          '/Users/fixture',
        ),
      /cost authorization is not approved/u,
    );
  });

  it('treats an uninitialized lifecycle database as pending without hiding query failures', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-visible-agent-lifecycle-'));
    const databasePath = join(fixtureRoot, 'neko.db');
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(databasePath);
    try {
      assert.equal(await readLatestVisibleAgentLifecycleState(databasePath), undefined);
      database.exec(`CREATE TABLE agent_conversation_lifecycle (snapshot_json TEXT NOT NULL)`);
      database
        .prepare(`INSERT INTO agent_conversation_lifecycle (snapshot_json) VALUES (?)`)
        .run(JSON.stringify({ pendingTurn: { status: 'failed' } }));
      assert.equal(await readLatestVisibleAgentLifecycleState(databasePath), undefined);
      database.exec(`CREATE TABLE agent_conversation_records (payload_json TEXT NOT NULL)`);
      database.prepare(`INSERT INTO agent_conversation_records (payload_json) VALUES (?)`).run(
        JSON.stringify({
          conversationId: 'conversation-1',
          pendingTurn: {
            turnId: 'turn-1',
            status: 'completed',
          },
        }),
      );
      assert.deepEqual(await readLatestVisibleAgentLifecycleState(databasePath), {
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        status: 'completed',
        diagnostic: undefined,
      });
    } finally {
      database.close();
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

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
      OPENNEKO_DESKTOP_FUNCTIONAL_CUT_EXPORT:
        '/tmp/openneko-desktop-functional-cut/workspace/exports/functional-cut-export.mp4',
    });
  });

  it('rejects functional launch paths that can reach user storage', () => {
    const base = {
      platform: 'darwin',
      target: 'development',
      fixtureHome: '/tmp/openneko-desktop-functional-storage',
      userDataRoot: '/tmp/openneko-desktop-functional-storage/electron-user-data',
      workspacePath: '/tmp/openneko-desktop-functional-storage/workspace',
      debugPort: 43128,
    };

    assert.throws(
      () => createAutomatedDesktopLaunch({ ...base, fixtureHome: '/Users/example' }),
      /unsafe directory name/u,
    );
    assert.throws(
      () =>
        createAutomatedDesktopLaunch({
          ...base,
          userDataRoot: '/Users/example/Library/Application Support/OpenNeko',
        }),
      /Electron userData must remain inside its fixture home/u,
    );
    assert.throws(
      () =>
        createAutomatedDesktopLaunch({
          ...base,
          workspacePath: '/Users/example/OpenNekoProjects/user-project',
        }),
      /Workspace must remain inside its fixture home/u,
    );
    assert.throws(
      () =>
        createDesktopUiFunctionalLaunch({
          platform: 'darwin',
          fixtureHome: base.fixtureHome,
          userDataRoot: '/Users/example/Library/Application Support/OpenNeko',
          workspacePath: base.workspacePath,
        }),
      /Electron userData must remain inside its fixture home/u,
    );
    assert.throws(
      () =>
        createDesktopUiFunctionalLaunch({
          platform: 'darwin',
          fixtureHome: base.fixtureHome,
          userDataRoot: base.userDataRoot,
          workspacePath: '/Users/example/OpenNekoProjects/user-project',
        }),
      /Workspace must remain inside its fixture home/u,
    );
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

  it('launches the exact fingerprint-verified packaged executable supplied by Evaluation', () => {
    const launch = createAutomatedDesktopLaunch({
      platform: 'darwin',
      target: 'packaged',
      executablePath: '/tmp/isolated-build/OpenNeko.app/Contents/MacOS/OpenNeko',
      fixtureHome: '/tmp/openneko-desktop-functional-isolated-build',
      userDataRoot: '/tmp/openneko-desktop-functional-isolated-build/electron-user-data',
      workspacePath: '/tmp/openneko-desktop-functional-isolated-build/workspace',
      debugPort: 43127,
    });

    assert.equal(launch.command, '/tmp/isolated-build/OpenNeko.app/Contents/MacOS/OpenNeko');
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

  it('drives text, keyboard, scrolling, and screenshot evidence through CDP', async () => {
    const calls = [];
    const cdp = {
      async send(method, params) {
        calls.push({ method, params });
        if (method === 'Runtime.evaluate') {
          return { result: { value: { x: 40, y: 20, hitTarget: true } } };
        }
        if (method === 'Page.captureScreenshot') {
          return { data: Buffer.from('synthetic-png').toString('base64') };
        }
        return {};
      },
    };

    await typeDesktopText(cdp, '[data-testid="prompt"]', 'hello', 0, {
      platform: 'darwin',
    });
    await pressDesktopKey(cdp, 'Enter', ['Shift']);
    await pressDesktopKey(cdp, 'F10', ['Shift']);
    await pressDesktopKey(cdp, 'End');
    await scrollDesktopElement(cdp, '[data-testid="timeline"]', 0, { deltaY: 240 });
    await dragDesktopElement(cdp, '[data-testid="clip"]', '[data-testid="track"]');
    const screenshot = await captureDesktopScreenshot(cdp);

    assert.equal(Buffer.from(screenshot, 'base64').toString('utf8'), 'synthetic-png');
    assert.deepEqual(
      calls.filter((call) => call.method === 'Input.insertText'),
      [{ method: 'Input.insertText', params: { text: 'hello' } }],
    );
    assert.deepEqual(
      calls
        .filter((call) => call.method === 'Input.dispatchKeyEvent')
        .map((call) => [call.params.type, call.params.key, call.params.modifiers]),
      [
        ['keyDown', 'a', 4],
        ['keyUp', 'a', 4],
        ['keyDown', 'Backspace', 0],
        ['keyUp', 'Backspace', 0],
        ['keyDown', 'Enter', 8],
        ['keyUp', 'Enter', 8],
        ['keyDown', 'F10', 8],
        ['keyUp', 'F10', 8],
        ['keyDown', 'End', 0],
        ['keyUp', 'End', 0],
      ],
    );
    assert.deepEqual(
      calls.find(
        (call) =>
          call.method === 'Input.dispatchKeyEvent' &&
          call.params.type === 'keyDown' &&
          call.params.key === 'Enter',
      )?.params,
      {
        type: 'keyDown',
        modifiers: 8,
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: '\r',
        unmodifiedText: '\r',
      },
    );
    assert.deepEqual(
      calls.find(
        (call) => call.method === 'Input.dispatchMouseEvent' && call.params.type === 'mouseWheel',
      )?.params,
      {
        type: 'mouseWheel',
        x: 40,
        y: 20,
        deltaX: 0,
        deltaY: 240,
        button: 'none',
        buttons: 0,
        pointerType: 'mouse',
      },
    );
    assert.deepEqual(
      calls
        .filter(
          (call) =>
            call.method === 'Input.dispatchMouseEvent' &&
            ['mousePressed', 'mouseReleased'].includes(call.params.type),
        )
        .slice(-2)
        .map((call) => [call.params.type, call.params.buttons]),
      [
        ['mousePressed', 1],
        ['mouseReleased', 0],
      ],
    );
    assert.equal(
      calls.filter(
        (call) => call.method === 'Input.dispatchMouseEvent' && call.params.type === 'mouseMoved',
      ).length,
      12,
    );
    assert.deepEqual(calls.at(-1), {
      method: 'Page.captureScreenshot',
      params: { format: 'png', fromSurface: true, captureBeyondViewport: false },
    });
  });

  it('captures exact Renderer DOM and heap resource counters through CDP', async () => {
    const calls = [];
    const cdp = {
      async send(method) {
        calls.push(method);
        if (method === 'Memory.getDOMCounters') {
          return { documents: 2, nodes: 320, jsEventListeners: 41 };
        }
        if (method === 'Performance.getMetrics') {
          return {
            metrics: [
              { name: 'JSHeapUsedSize', value: 12_000_000 },
              { name: 'JSHeapTotalSize', value: 24_000_000 },
            ],
          };
        }
        return {};
      },
    };

    assert.deepEqual(await readDesktopRendererResources(cdp), {
      documents: 2,
      nodes: 320,
      jsEventListeners: 41,
      jsHeapUsedBytes: 12_000_000,
      jsHeapTotalBytes: 24_000_000,
    });
    assert.deepEqual(calls, [
      'Performance.enable',
      'Memory.getDOMCounters',
      'Performance.getMetrics',
    ]);
  });

  it('fails visibly for invalid keyboard and scroll requests', async () => {
    const cdp = { send: async () => ({}) };

    await assert.rejects(() => pressDesktopKey(cdp, 'F13'), /Unsupported Desktop keyboard key/u);
    await assert.rejects(
      () => pressDesktopKey(cdp, 'Enter', ['Command']),
      /Unsupported Desktop keyboard modifier/u,
    );
    await assert.rejects(
      () => scrollDesktopElement(cdp, 'body', 0, { deltaY: 0 }),
      /requires a non-zero delta/u,
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
