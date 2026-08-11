import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MCPServerConfig, MCPToolResult } from '@neko/agent-contracts';
import type { AutomationTarget } from '@neko/automation-contracts';
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
        target,
        mode: 'observe',
        timeoutMs: 12_345,
      });
      await client.connect({ signal: controller.signal });

      const launch = fixture.configs[0]!;
      expect(launch).toMatchObject({
        command: fixture.runtime.executablePath,
        args: ['--mcp'],
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
      target,
      mode: 'observe',
      timeoutMs: 30_000,
    });
    const second = fixture.factory.createSessionClient({
      sessionId: 'session-b',
      target,
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await inspection.connect({});
    const inspectionHome = requireEnvironment(fixture.configs[0]!, 'HOME');
    await first.connect({});
    await second.connect({});

    const homes = fixture.configs.map((config) => requireEnvironment(config, 'HOME'));
    expect(new Set(homes).size).toBe(3);
    expect(fixture.configs[0]?.env?.['BROWSER_USE_ALLOWED_DOMAINS']).toBe('inspection.invalid');
    expect(fixture.clients).toHaveLength(3);
    await inspection.disconnect();
    await expect(readFile(inspectionHome, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('forwards Tool discovery, calls and cancellation through the canonical MCP client', async () => {
    const fixture = await createFixture();
    const client = fixture.factory.createSessionClient({
      sessionId: 'session-tools',
      target,
      mode: 'observe',
      timeoutMs: 30_000,
    });
    await client.connect({});
    const controller = new AbortController();

    await expect(client.listTools({ signal: controller.signal })).resolves.toEqual([
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
    const outsideExecutable = path.join(outside, 'browser-use');
    await writeFile(outsideExecutable, 'fixture');
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
      validateRuntime: async () => undefined,
      createClient: () => createFakeClient(),
    });

    await expect(
      factory
        .createSessionClient({
          sessionId: 'session-poisoned',
          target,
          mode: 'observe',
          timeoutMs: 30_000,
        })
        .connect({}),
    ).rejects.toThrow('authorization changed before launch');
  });

  it('validates the exact Browser Use interpreter without a distribution release gate', async () => {
    const root = await createRoot();
    const interpreter = path.join(root, 'python');
    const executablePath = path.join(root, 'browser-use');
    const browserExecutablePath = path.join(root, 'chromium');
    await Promise.all([
      writeFile(interpreter, 'python fixture'),
      writeFile(executablePath, `#!${interpreter}\n`),
      writeFile(browserExecutablePath, 'browser fixture'),
    ]);
    const runtime = { executablePath, browserExecutablePath };

    await expect(validateDesktopBrowserUseRuntime(runtime)).resolves.toBeUndefined();
  });
});

async function createFixture() {
  const root = await createRoot();
  const runtimeRoot = path.join(root, 'runtime');
  const browserRoot = path.join(root, 'browser');
  await Promise.all([mkdir(runtimeRoot), mkdir(browserRoot)]);
  const runtime: DesktopBrowserUseRuntimeLayout = {
    executablePath: path.join(runtimeRoot, 'browser-use'),
    browserExecutablePath: path.join(browserRoot, 'chromium'),
  };
  await Promise.all([
    writeFile(runtime.executablePath, 'fixture'),
    writeFile(runtime.browserExecutablePath, 'fixture'),
  ]);
  const configs: MCPServerConfig[] = [];
  const clients: ReturnType<typeof createFakeClient>[] = [];
  const client = createFakeClient();
  const factory = createDesktopBrowserUseMcpClientFactory({
    runtime,
    storageRoot: path.join(root, 'storage'),
    validateRuntime: async () => undefined,
    createClient: (config) => {
      configs.push(config);
      const created = clients.length === 0 ? client : createFakeClient();
      clients.push(created);
      return created;
    },
  });
  return { factory, runtime, configs, clients, client };
}

function createFakeClient() {
  const result: MCPToolResult = {
    content: [
      { type: 'text', text: 'state' },
      { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
    ],
    structuredContent: { source: 'browser-use' },
  };
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    getConnectionInfo: vi.fn(() => ({
      protocolVersion: '2025-06-18',
      server: { name: 'browser-use', version: '0.1.0' },
      capabilities: {},
    })),
    listTools: vi.fn(async () => [
      {
        name: 'browser_screenshot',
        description: 'Capture screenshot',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true },
      },
    ]),
    callTool: vi.fn(async () => result),
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

const target: AutomationTarget = {
  kind: 'browser',
  targetKey: 'browser-target',
  browserProfileId: 'browser-profile',
  browserSessionId: 'browser-session',
  tabId: 'browser-tab',
  origin: 'https://example.test',
  allowedDomains: ['example.test', 'assets.example.test'],
  label: 'Example',
};
