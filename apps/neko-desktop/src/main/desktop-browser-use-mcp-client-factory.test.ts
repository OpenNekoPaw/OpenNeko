import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MCPServerConfig, MCPToolDefinition, MCPToolResult } from '@neko/agent-contracts';
import type { BrowserAutomationTarget } from '@neko/automation-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDesktopBrowserUseMcpClientFactory,
  type DesktopBrowserUseRuntimeLayout,
  validateDesktopBrowserUseRuntime,
} from './desktop-browser-use-mcp-client-factory';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop Browser Use MCP client factory', () => {
  it('prepares an isolated Browser Use config and exact environment without Host secrets', async () => {
    const fixture = await createFixture();
    const controller = new AbortController();
    process.env['OPENNEKO_BROWSER_USE_SECRET_FIXTURE'] = 'must-not-leak';
    try {
      const client = fixture.factory.createSessionClient({
        sessionId: 'session-a',
        target: targetFor('session-a'),
        mode: 'observe',
        timeoutMs: 12_345,
      });
      await client.connect({ signal: controller.signal });

      const launch = fixture.configs[0]!;
      expect(launch).toMatchObject({
        command: fixture.interpreterPath,
        args: [fixture.runtime.executablePath, '--mcp'],
        inheritProcessEnv: false,
        requestTimeout: 12_345,
      });
      expect(launch.cwd).toBe(path.dirname(requireEnvironment(launch, 'HOME')));
      expect(launch.cwd).not.toBe(path.dirname(fixture.runtime.executablePath));
      expect(launch.env).toMatchObject({
        BROWSER_USE_ALLOWED_DOMAINS: 'example.test,assets.example.test',
        BROWSER_USE_DISABLE_EXTENSIONS: 'true',
        BROWSER_USE_CLOUD_SYNC: 'false',
        ANONYMIZED_TELEMETRY: 'false',
        PATH: path.dirname(fixture.runtime.executablePath),
      });
      expect(launch.env).not.toHaveProperty('OPENNEKO_BROWSER_USE_SECRET_FIXTURE');
      expect(launch.env?.['HOME']).not.toBe(process.env['HOME']);
      expect(fixture.client.connect).toHaveBeenCalledWith({ signal: controller.signal });

      const config = JSON.parse(
        await readFile(requireEnvironment(launch, 'BROWSER_USE_CONFIG_PATH'), 'utf8'),
      ) as Record<string, unknown>;
      expect(config).toMatchObject({
        browser_profile: {
          openneko: {
            executable_path: fixture.runtime.browserExecutablePath,
            allowed_domains: ['example.test', 'assets.example.test'],
            enable_default_extensions: false,
          },
        },
        llm: {},
        agent: {},
      });
      expect(JSON.stringify(config)).not.toContain('api_key');
    } finally {
      delete process.env['OPENNEKO_BROWSER_USE_SECRET_FIXTURE'];
    }
  });

  it('uses distinct directory owners and clients for inspection and concurrent sessions', async () => {
    const fixture = await createFixture();
    const inspection = fixture.factory.createInspectionClient();
    const first = fixture.factory.createSessionClient({
      sessionId: 'session-a',
      target: targetFor('session-a'),
      mode: 'observe',
      timeoutMs: 30_000,
    });
    const second = fixture.factory.createSessionClient({
      sessionId: 'session-b',
      target: targetFor('session-b'),
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await inspection.connect({});
    const inspectionHome = requireEnvironment(fixture.configs[0]!, 'HOME');
    await first.connect({});
    const firstHome = requireEnvironment(fixture.configs[1]!, 'HOME');
    await second.connect({});

    const homes = fixture.configs.map((config) => requireEnvironment(config, 'HOME'));
    expect(new Set(homes).size).toBe(3);
    expect(fixture.configs[0]?.env?.['BROWSER_USE_ALLOWED_DOMAINS']).toBe('inspection.invalid');
    expect(fixture.clients).toHaveLength(3);
    await inspection.disconnect();
    await expect(readFile(inspectionHome, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await first.disconnect();
    await expect(readFile(firstHome, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await second.disconnect();
  });

  it('forwards Tool discovery, calls and cancellation through the canonical MCP client', async () => {
    const fixture = await createFixture();
    const client = fixture.factory.createSessionClient({
      sessionId: 'session-tools',
      target: targetFor('session-tools'),
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await client.connect({});
    const controller = new AbortController();

    await expect(client.listTools({ signal: controller.signal })).resolves.toEqual([
      {
        name: 'browser_navigate',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' }, new_tab: { type: 'boolean' } },
        },
      },
      {
        name: 'browser_list_tabs',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'browser_screenshot',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true },
      },
    ]);
    await expect(
      client.callTool({
        name: 'browser_screenshot',
        arguments: { full_page: false },
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      content: [
        { type: 'text', text: 'state' },
        { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
      ],
      structuredContent: { source: 'browser-use' },
    });
    expect(fixture.client.callTool).toHaveBeenCalledWith(
      'browser_screenshot',
      { full_page: false },
      { signal: controller.signal },
    );
  });

  it('rejects a non-canonical symlink instead of resolving another local runtime path', async () => {
    const root = await createRoot();
    const runtimeRoot = path.join(root, 'runtime');
    const outside = path.join(root, 'outside');
    await Promise.all([mkdir(runtimeRoot), mkdir(outside)]);
    const interpreterPath = path.join(outside, 'python');
    const outsideExecutable = path.join(outside, 'browser-use');
    await Promise.all([
      writeFile(interpreterPath, 'python fixture'),
      writeFile(outsideExecutable, `#!${interpreterPath}\n`),
    ]);
    const linkedExecutable = path.join(runtimeRoot, 'browser-use');
    await symlink(outsideExecutable, linkedExecutable);
    const browserExecutablePath = path.join(outside, 'chromium');
    await writeFile(browserExecutablePath, 'fixture');
    const factory = createDesktopBrowserUseMcpClientFactory({
      runtime: {
        executablePath: linkedExecutable,
        browserExecutablePath,
      },
      storageRoot: path.join(root, 'storage'),
      validateRuntime: async () => ({ interpreterPath }),
      createClient: () => createFakeClient(),
    });

    await expect(
      factory
        .createSessionClient({
          sessionId: 'session-poisoned',
          target: targetFor('session-poisoned'),
          mode: 'observe',
          timeoutMs: 30_000,
        })
        .connect({}),
    ).rejects.toThrow('authorization changed before launch');
  });

  it('validates the exact Browser Use interpreter without a distribution release gate', async () => {
    const root = await createRoot();
    const interpreterTarget = path.join(root, 'python3.12');
    const interpreter = path.join(root, 'python');
    const executablePath = path.join(root, 'browser-use');
    const browserExecutablePath = path.join(root, 'chromium');
    await Promise.all([
      writeFile(interpreterTarget, 'python fixture'),
      writeFile(executablePath, `#!${interpreter}\n`),
      writeFile(browserExecutablePath, 'browser fixture'),
    ]);
    await symlink(interpreterTarget, interpreter);
    const runtime = { executablePath, browserExecutablePath };

    await expect(validateDesktopBrowserUseRuntime(runtime)).resolves.toEqual({
      interpreterPath: interpreterTarget,
    });
  });

  it('rejects a changed uv tool interpreter link before another connection', async () => {
    const root = await createRoot();
    const firstInterpreter = path.join(root, 'python-first');
    const secondInterpreter = path.join(root, 'python-second');
    const interpreterLink = path.join(root, 'python');
    const executablePath = path.join(root, 'browser-use');
    const browserExecutablePath = path.join(root, 'chromium');
    await Promise.all([
      writeFile(firstInterpreter, 'first python fixture'),
      writeFile(secondInterpreter, 'second python fixture'),
      writeFile(executablePath, `#!${interpreterLink}\n`),
      writeFile(browserExecutablePath, 'browser fixture'),
    ]);
    await symlink(firstInterpreter, interpreterLink);
    const factory = createDesktopBrowserUseMcpClientFactory({
      runtime: { executablePath, browserExecutablePath },
      storageRoot: path.join(root, 'storage'),
      createClient: () => createFakeClient(),
    });
    const first = factory.createSessionClient({
      sessionId: 'session-first-interpreter',
      target: targetFor('session-first-interpreter'),
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await first.connect({});
    await first.disconnect();
    await unlink(interpreterLink);
    await symlink(secondInterpreter, interpreterLink);

    await expect(
      factory
        .createSessionClient({
          sessionId: 'session-changed-interpreter',
          target: targetFor('session-changed-interpreter'),
          mode: 'observe',
          timeoutMs: 30_000,
        })
        .connect({}),
    ).rejects.toThrow('interpreter authorization changed before launch');
  });

  it('allows only one owned client for a session identity', async () => {
    const fixture = await createFixture();
    const first = fixture.factory.createSessionClient({
      sessionId: 'session-exclusive',
      target: targetFor('session-exclusive'),
      mode: 'observe',
      timeoutMs: 30_000,
    });

    expect(() =>
      fixture.factory.createSessionClient({
        sessionId: 'session-exclusive',
        target: targetFor('session-exclusive'),
        mode: 'observe',
        timeoutMs: 30_000,
      }),
    ).toThrow('already owns a client');

    await first.connect({});
    await first.disconnect();
    expect(() =>
      fixture.factory.createSessionClient({
        sessionId: 'session-exclusive',
        target: targetFor('session-exclusive'),
        mode: 'observe',
        timeoutMs: 30_000,
      }),
    ).not.toThrow();
  });

  it('fails visibly when the isolated Browser client opens more than one page', async () => {
    const fixture = await createFixture({
      tabInventories: [
        [{ tab_id: 'tab1', url: 'https://example.test/', title: 'Example' }],
        [{ tab_id: 'tab1', url: 'https://example.test/', title: 'Example' }],
        [
          { tab_id: 'tab1', url: 'https://example.test/', title: 'Example' },
          { tab_id: 'tab2', url: 'https://example.test/popup', title: 'Popup' },
        ],
      ],
    });
    const client = fixture.factory.createSessionClient({
      sessionId: 'session-popup',
      target: targetFor('session-popup'),
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await client.connect({});

    await expect(client.callTool({ name: 'browser_screenshot', arguments: {} })).rejects.toThrow(
      'must contain exactly one page',
    );
    expect(fixture.client.callTool).toHaveBeenCalledWith('browser_screenshot', {}, {});
    await client.disconnect();
  });

  it('revalidates the exact session-owned page and rejects target transfer', async () => {
    const fixture = await createFixture();
    const sessionTarget = targetFor('session-revalidate');
    const client = fixture.factory.createSessionClient({
      sessionId: 'session-revalidate',
      target: sessionTarget,
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await client.connect({});

    await expect(
      fixture.factory.revalidateSessionTarget({ target: sessionTarget }),
    ).resolves.toEqual(sessionTarget);
    await expect(
      fixture.factory.revalidateSessionTarget({
        target: { ...sessionTarget, origin: 'https://other.test', allowedDomains: ['other.test'] },
      }),
    ).rejects.toThrow('target identity changed');
    await client.disconnect();
  });

  it('fails visibly when the sole page leaves the user-confirmed origin', async () => {
    const fixture = await createFixture({
      tabInventories: [
        [{ tab_id: 'tab1', url: 'https://example.test/', title: 'Example' }],
        [{ tab_id: 'tab1', url: 'https://other.test/', title: 'Other' }],
      ],
    });
    const sessionTarget = targetFor('session-origin');
    const client = fixture.factory.createSessionClient({
      sessionId: 'session-origin',
      target: sessionTarget,
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await client.connect({});

    await expect(
      fixture.factory.revalidateSessionTarget({ target: sessionTarget }),
    ).rejects.toThrow('left the user-authorized origin');
    await client.disconnect();
  });
});

async function createFixture(input: { readonly tabInventories?: readonly unknown[] } = {}) {
  const root = await createRoot();
  const runtimeRoot = path.join(root, 'runtime');
  const browserRoot = path.join(root, 'browser');
  await Promise.all([mkdir(runtimeRoot), mkdir(browserRoot)]);
  const interpreterPath = path.join(runtimeRoot, 'python');
  const runtime: DesktopBrowserUseRuntimeLayout = {
    executablePath: path.join(runtimeRoot, 'browser-use'),
    browserExecutablePath: path.join(browserRoot, 'chromium'),
  };
  await Promise.all([
    writeFile(interpreterPath, 'python fixture'),
    writeFile(runtime.executablePath, `#!${interpreterPath}\n`),
    writeFile(runtime.browserExecutablePath, 'fixture'),
  ]);
  const configs: MCPServerConfig[] = [];
  const clients: ReturnType<typeof createFakeClient>[] = [];
  const client = createFakeClient(input.tabInventories);
  const factory = createDesktopBrowserUseMcpClientFactory({
    runtime,
    storageRoot: path.join(root, 'storage'),
    createClient: (config) => {
      configs.push(config);
      const created = clients.length === 0 ? client : createFakeClient();
      clients.push(created);
      return created;
    },
  });
  return { factory, runtime, interpreterPath, configs, clients, client };
}

function createFakeClient(tabInventories: readonly unknown[] = []) {
  let tabInventoryIndex = 0;
  const result: MCPToolResult = {
    content: [
      { type: 'text', text: 'state' },
      { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
    ],
    structuredContent: { source: 'browser-use' },
  };
  const tools: MCPToolDefinition[] = [
    {
      name: 'browser_navigate',
      description: 'Navigate',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' }, new_tab: { type: 'boolean' } },
      },
    },
    {
      name: 'browser_list_tabs',
      description: 'List tabs',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browser_screenshot',
      description: 'Capture screenshot',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
    },
  ];
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    getConnectionInfo: vi.fn(() => ({
      protocolVersion: '2025-06-18',
      server: { name: 'browser-use', version: '0.1.0' },
      capabilities: {},
    })),
    listTools: vi.fn(async () => tools),
    callTool: vi.fn(async (name: string): Promise<MCPToolResult> => {
      if (name === 'browser_navigate') return { content: [{ type: 'text', text: 'Navigated' }] };
      if (name === 'browser_list_tabs') {
        const inventory = tabInventories[tabInventoryIndex];
        tabInventoryIndex += 1;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                inventory ?? [{ tab_id: 'tab1', url: 'https://example.test/', title: 'Example' }],
              ),
            },
          ],
        };
      }
      return result;
    }),
  };
}

function requireEnvironment(config: MCPServerConfig, name: string): string {
  const value = config.env?.[name];
  if (!value) throw new Error(`Missing fixture environment '${name}'.`);
  return value;
}

async function createRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'openneko-browser-use-')));
  roots.push(root);
  return root;
}

function targetFor(sessionId: string): BrowserAutomationTarget {
  return {
    kind: 'browser',
    targetKey: `browser-target:${sessionId}`,
    browserProfileId: `browser-profile:${sessionId}`,
    browserSessionId: sessionId,
    tabId: `browser-page:${sessionId}`,
    origin: 'https://example.test',
    allowedDomains: ['example.test', 'assets.example.test'],
    label: 'Example',
  };
}
