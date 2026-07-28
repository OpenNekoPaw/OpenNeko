import { describe, expect, it, vi } from 'vitest';
import type { ILogger } from '@neko/shared/logger';
import { createDesktopBootstrapRequest } from '../shared/bridge-contract';
import { createDesktopWindowMutationRequest } from '../shared/shell-contract';
import { DesktopAppHost } from './app-host';
import type { DesktopWorkspaceRegistry } from './desktop-workspace-registry';
import { createElectronNekoHostPorts } from './electron-host-ports';
import { DESKTOP_APP_ORIGIN } from './security';
import { DesktopShellService } from './shell-service';
import {
  DesktopShellStateRepository,
  type DesktopShellStateFilePort,
} from './shell-state-repository';

describe('DesktopAppHost', () => {
  it('derives bootstrap identity from the registered sender and redacts host environment', async () => {
    const logger = createLogger();
    const host = createElectronNekoHostPorts({
      homedir: '/Users/fixture',
      nekoHome: '/Users/fixture/Library/Application Support/OpenNeko',
      version: '0.0.1',
      env: { OPENNEKO_PRIVATE_TEST_VALUE: 'must-not-cross-bridge' },
      locale: 'zh-CN',
      logger,
    });
    const appHost = new DesktopAppHost({
      host,
      version: '0.0.1',
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
    });
    appHost.windows.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });
    appHost.windows.rendererLoading('window-1', 'app-1');

    const projection = await appHost.createBootstrapProjection(
      {
        webContentsId: 10,
        frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
      },
      createDesktopBootstrapRequest('request-1'),
    );

    expect(projection).toMatchObject({
      requestId: 'request-1',
      application: {
        applicationId: 'neko-desktop',
        instanceId: 'app-1',
      },
      window: {
        windowId: 'window-1',
        rendererEpoch: 1,
      },
      host: {
        kind: 'electron',
        ui: 'graphical',
      },
    });
    expect(JSON.stringify(projection)).not.toContain('must-not-cross-bridge');
    expect(JSON.stringify(projection)).not.toContain('/Users/fixture');
  });

  it('fails visibly after disposal', async () => {
    const logger = createLogger();
    const appHost = new DesktopAppHost({
      host: createElectronNekoHostPorts({
        homedir: '/Users/fixture',
        nekoHome: '/Users/fixture/.openneko',
        version: '0.0.1',
        logger,
      }),
      version: '0.0.1',
      instanceId: 'app-1',
      logger,
      shell: createShellService('app-1'),
    });
    await appHost.dispose();

    await expect(
      appHost.createBootstrapProjection(
        {
          webContentsId: 10,
          frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
        },
        createDesktopBootstrapRequest('request-1'),
      ),
    ).rejects.toThrow('Desktop AppHost is disposed');
  });

  it('rejects an unknown sender before opening the workspace picker', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => '/workspace/demo');

    await expect(
      fixture.appHost.openContentProject(
        {
          webContentsId: 11,
          frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
        },
        createDesktopWindowMutationRequest(
          'request-1',
          fixture.projection.endpointEpoch,
          fixture.projection.window.revision,
        ),
        selectWorkspace,
      ),
    ).rejects.toThrow("Unknown Desktop IPC sender '11'");
    expect(selectWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('rejects a replaced renderer before opening the workspace picker', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => '/workspace/demo');
    fixture.appHost.windows.rendererLoading(fixture.windowId, 'app-1');
    fixture.appHost.shell.setRendererEpoch(fixture.windowId, 2);

    await expect(
      fixture.appHost.openContentProject(
        fixture.sender,
        createDesktopWindowMutationRequest(
          'request-1',
          fixture.projection.endpointEpoch,
          fixture.projection.window.revision,
        ),
        selectWorkspace,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect(selectWorkspace).not.toHaveBeenCalled();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('returns a current projection without persistence when the picker is cancelled', async () => {
    const fixture = await createShellAppHost();
    const selectWorkspace = vi.fn(async () => undefined);

    const result = await fixture.appHost.openContentProject(
      fixture.sender,
      createDesktopWindowMutationRequest(
        'request-1',
        fixture.projection.endpointEpoch,
        fixture.projection.window.revision,
      ),
      selectWorkspace,
    );

    expect(result).toEqual({
      schemaVersion: 1,
      requestId: 'request-1',
      status: 'cancelled',
      projection: fixture.projection,
    });
    expect(selectWorkspace).toHaveBeenCalledOnce();
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });
});

function createLogger(): ILogger {
  return {
    source: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => createLogger(),
    setLevel: vi.fn(),
  };
}

function createShellService(applicationInstanceId: string): DesktopShellService {
  return createShellFixture(applicationInstanceId).service;
}

function createShellFixture(applicationInstanceId: string): {
  readonly service: DesktopShellService;
  readonly registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
  };
} {
  let content: string | null = null;
  const file: DesktopShellStateFilePort = {
    readTextIfExists: async () => content,
    writeTextAtomic: async (next) => {
      content = next;
    },
  };
  const registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
  } = {
    resolve: vi.fn(async () => {
      throw new Error('Workspace resolution is not expected by this AppHost test.');
    }),
    dispose: vi.fn(async () => undefined),
  };
  return {
    registry,
    service: new DesktopShellService({
      applicationInstanceId,
      stateRepository: new DesktopShellStateRepository(file),
      workspaceRegistry: registry,
      createIdentity: () => 'window-1',
    }),
  };
}

async function createShellAppHost() {
  const logger = createLogger();
  const fixture = createShellFixture('app-1');
  const appHost = new DesktopAppHost({
    host: createElectronNekoHostPorts({
      homedir: '/Users/fixture',
      nekoHome: '/Users/fixture/.openneko',
      version: '0.0.1',
      logger,
    }),
    version: '0.0.1',
    instanceId: 'app-1',
    logger,
    shell: fixture.service,
  });
  const windowId = await appHost.shell.claimWindowId();
  appHost.windows.register({
    windowId,
    webContentsId: 10,
    allowedOrigin: DESKTOP_APP_ORIGIN,
  });
  const lifecycle = appHost.windows.rendererLoading(windowId, 'app-1');
  appHost.shell.setRendererEpoch(windowId, lifecycle.rendererEpoch);
  return {
    appHost,
    registry: fixture.registry,
    windowId,
    sender: {
      webContentsId: 10,
      frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    },
    projection: await appHost.shell.getProjection(windowId),
  };
}
