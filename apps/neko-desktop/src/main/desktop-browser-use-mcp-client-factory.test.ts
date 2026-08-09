import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MCPServerConfig, MCPToolResult } from '@neko/agent-contracts';
import type { AutomationTarget } from '@neko/automation-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDesktopBrowserUseMcpClientFactory,
  type DesktopBrowserUseRuntimeLayout,
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
      expect(launch.cwd).not.toBe(fixture.runtime.runtimeRoot);
      expect(launch.env).toMatchObject({
        BROWSER_USE_ALLOWED_DOMAINS: 'example.test,assets.example.test',
        BROWSER_USE_DISABLE_EXTENSIONS: 'true',
        BROWSER_USE_CLOUD_SYNC: 'false',
        ANONYMIZED_TELEMETRY: 'false',
        PATH: fixture.runtime.binaryPath,
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

  it('uses distinct directory owners and clients for qualification and concurrent sessions', async () => {
    const fixture = await createFixture();
    const qualification = fixture.factory.createQualificationClient();
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
    await qualification.connect({});
    const qualificationHome = requireEnvironment(fixture.configs[0]!, 'HOME');
    await first.connect({});
    await second.connect({});

    const homes = fixture.configs.map((config) => requireEnvironment(config, 'HOME'));
    expect(new Set(homes).size).toBe(3);
    expect(fixture.configs[0]?.env?.['BROWSER_USE_ALLOWED_DOMAINS']).toBe('qualification.invalid');
    expect(fixture.clients).toHaveLength(3);
    await qualification.disconnect();
    await expect(readFile(qualificationHome, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
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

  it('rejects a symlinked executable that resolves outside the installed runtime', async () => {
    const root = await createRoot();
    const runtimeRoot = path.join(root, 'runtime');
    const outside = path.join(root, 'outside');
    await Promise.all([mkdir(runtimeRoot), mkdir(outside)]);
    const outsideExecutable = path.join(outside, 'browser-use');
    await writeFile(outsideExecutable, 'fixture');
    const linkedExecutable = path.join(runtimeRoot, 'browser-use');
    await symlink(outsideExecutable, linkedExecutable);
    const browserExecutablePath = path.join(runtimeRoot, 'chromium');
    await writeFile(browserExecutablePath, 'fixture');
    const binaryPath = path.join(runtimeRoot, 'bin');
    await mkdir(binaryPath);
    const factory = createDesktopBrowserUseMcpClientFactory({
      runtime: {
        runtimeRoot,
        executablePath: linkedExecutable,
        browserExecutablePath,
        binaryPath,
      },
      storageRoot: path.join(root, 'storage'),
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
    ).rejects.toThrow('escapes the installed extension runtime');
  });
});

async function createFixture() {
  const root = await createRoot();
  const runtimeRoot = path.join(root, 'runtime');
  const binaryPath = path.join(runtimeRoot, 'bin');
  await mkdir(binaryPath, { recursive: true });
  const runtime: DesktopBrowserUseRuntimeLayout = {
    runtimeRoot,
    executablePath: path.join(binaryPath, 'browser-use'),
    browserExecutablePath: path.join(runtimeRoot, 'chromium'),
    binaryPath,
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
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-browser-use-'));
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
