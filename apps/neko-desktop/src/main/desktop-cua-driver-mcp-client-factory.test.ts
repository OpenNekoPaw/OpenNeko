import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MCPServerConfig, MCPToolResult } from '@neko/agent-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopCuaDriverMcpClientFactory } from './desktop-cua-driver-mcp-client-factory';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop Cua Driver MCP client factory', () => {
  it('launches only direct bounded MCP with an exact app policy and no Host secrets', async () => {
    const fixture = await createFixture();
    process.env['OPENNEKO_CUA_SECRET_FIXTURE'] = 'must-not-leak';
    try {
      const client = fixture.factory.createSessionClient({
        sessionId: 'session-1',
        target,
        mode: 'observe',
        timeoutMs: 4_321,
      });
      await client.connect({});
      const launch = fixture.configs[0]!;
      expect(launch).toMatchObject({
        command: fixture.executablePath,
        args: ['mcp', '--direct'],
        inheritProcessEnv: false,
        requestTimeout: 4_321,
        env: {
          CUA_DRIVER_PERMISSION_MODE: 'bounded',
          CUA_DRIVER_SESSION_POLICY_APPROVED: '1',
        },
      });
      expect(launch.env).not.toHaveProperty('OPENNEKO_CUA_SECRET_FIXTURE');
      expect(launch.env).not.toHaveProperty('CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS');
      expect(launch.env?.['HOME']).not.toBe(process.env['HOME']);
      const policyPath = launch.env?.['CUA_DRIVER_SESSION_POLICY_FILE'] ?? '';
      const policy = JSON.parse(await readFile(policyPath, 'utf8'));
      expect(policy).toEqual({
        version: 2,
        mode: 'bounded',
        allow: { tools: ['verify_state'] },
        resources: {
          apps: [{ bundle_id: 'com.openneko.fixture', windows: 'all' }],
          desktop: { display: false },
        },
      });
      await client.disconnect();
      await expect(readFile(policyPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      delete process.env['OPENNEKO_CUA_SECRET_FIXTURE'];
    }
  });

  it('keeps unqualified modes and platforms unavailable', async () => {
    const fixture = await createFixture();
    expect(() =>
      fixture.factory.createSessionClient({
        sessionId: 'session-interact',
        target,
        mode: 'interact',
        timeoutMs: 5_000,
      }),
    ).toThrow("mode 'interact' is not qualified");
    expect(() =>
      createDesktopCuaDriverMcpClientFactory({
        runtime: {
          runtimeRoot: fixture.runtimeRoot,
          executablePath: fixture.executablePath,
          binaryPath: fixture.binaryPath,
        },
        storageRoot: path.join(fixture.root, 'other-storage'),
        platform: 'win32',
      }),
    ).toThrow("unavailable on 'win32'");
  });

  it('isolates target discovery in a short-lived read-only Desktop metadata policy', async () => {
    const fixture = await createFixture();
    const client = fixture.factory.createTargetDiscoveryClient();
    await client.connect({});
    const launch = fixture.configs[0]!;
    const policyPath = launch.env?.['CUA_DRIVER_SESSION_POLICY_FILE'] ?? '';
    expect(JSON.parse(await readFile(policyPath, 'utf8'))).toMatchObject({
      mode: 'bounded',
      allow: { tools: ['list_apps', 'list_windows'] },
      resources: { desktop: { display: true } },
    });
    expect(launch.args).toEqual(['mcp', '--direct']);
    expect(launch.inheritProcessEnv).toBe(false);
    await client.disconnect();
    await expect(readFile(policyPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-cua-driver-'));
  roots.push(root);
  const runtimeRoot = path.join(root, 'runtime');
  const binaryPath = path.join(runtimeRoot, 'bin');
  await mkdir(binaryPath, { recursive: true });
  const executablePath = path.join(binaryPath, 'cua-driver');
  await writeFile(executablePath, 'fixture');
  const configs: MCPServerConfig[] = [];
  const client = createFakeClient();
  const factory = createDesktopCuaDriverMcpClientFactory({
    runtime: { runtimeRoot, executablePath, binaryPath },
    storageRoot: path.join(root, 'storage'),
    platform: 'darwin',
    createClient: (config) => {
      configs.push(config);
      return client;
    },
  });
  return { root, runtimeRoot, binaryPath, executablePath, configs, client, factory };
}

function createFakeClient() {
  const result: MCPToolResult = {
    content: [{ type: 'text', text: '{"status":"satisfied"}' }],
  };
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    listTools: vi.fn(async () => []),
    callTool: vi.fn(async () => result),
  };
}

const target = {
  kind: 'computer' as const,
  targetKey: 'fixture:42:701',
  applicationId: 'com.openneko.fixture',
  processId: 42,
  windowId: '701',
  label: 'Fixture',
  region: { x: 10, y: 20, width: 800, height: 600 },
};
