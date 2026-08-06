import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeDescriptor,
} from '@neko/agent-contracts';
import {
  buildAgentPluginRuntime,
  createAgentExtensionSupport,
  parsePluginMcpDocument,
} from './plugin-runtime';

describe('Desktop plugin runtime', () => {
  it('parses contained stdio command/cwd and only explicitly projected environment', async () => {
    await withPlugin(async (pluginRoot) => {
      await mkdir(join(pluginRoot, 'bin'));
      await writeFile(join(pluginRoot, 'bin', 'launcher'), '#!/bin/sh\n', { mode: 0o755 });
      await writeFile(
        join(pluginRoot, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            fixture: {
              command: './bin/launcher',
              args: ['mcp'],
              cwd: '.',
              env_vars: ['CODEX_HOME'],
            },
          },
        }),
        'utf8',
      );
      const descriptor = mcpDescriptor(pluginRoot, ['fixture']);

      const parsed = await parsePluginMcpDocument(descriptor, {
        HOME: '/Users/fixture',
        PATH: '/usr/bin',
        CODEX_HOME: '/Users/fixture/.codex',
        PRIVATE_TOKEN: 'must-not-leak',
      });

      expect(parsed.failures).toEqual([]);
      expect(parsed.servers).toEqual([
        expect.objectContaining({
          id: 'fixture',
          command: join(pluginRoot, 'bin', 'launcher'),
          cwd: pluginRoot,
          inheritProcessEnv: false,
          env: {
            HOME: '/Users/fixture',
            PATH: '/usr/bin',
            CODEX_HOME: '/Users/fixture/.codex',
          },
        }),
      ]);
      expect(JSON.stringify(parsed.servers)).not.toContain('must-not-leak');
    });
  });

  it('supports HTTPS bearer env and rejects OAuth as unsupported', async () => {
    await withPlugin(async (pluginRoot) => {
      await writeFile(
        join(pluginRoot, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            github: {
              type: 'http',
              url: 'https://example.test/mcp',
              bearer_token_env_var: 'GITHUB_TOKEN',
            },
            figma: {
              type: 'http',
              url: 'https://example.test/figma',
              oauth_resource: 'https://example.test',
            },
          },
        }),
        'utf8',
      );
      const parsed = await parsePluginMcpDocument(mcpDescriptor(pluginRoot, ['github', 'figma']), {
        GITHUB_TOKEN: 'secret-token',
      });

      expect(parsed.servers).toEqual([
        expect.objectContaining({
          id: 'github',
          transport: 'http',
          headers: { Authorization: 'Bearer secret-token' },
        }),
      ]);
      expect(parsed.unsupported).toEqual(['oauth-unsupported']);
      expect(parsed.failures).toEqual([]);
    });
  });

  it('rejects a stdio command that escapes the plugin package', async () => {
    await withPlugin(async (pluginRoot) => {
      await writeFile(
        join(pluginRoot, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            unsafe: { command: '../outside-launcher' },
          },
        }),
        'utf8',
      );

      await expect(
        parsePluginMcpDocument(mcpDescriptor(pluginRoot, ['unsafe']), {}),
      ).resolves.toMatchObject({
        servers: [],
        failures: ['mcp-invalid'],
      });
    });
  });

  it('admits available plugins only through Pi-valid Skill or supported MCP contributions', async () => {
    await withPlugin(async (pluginRoot) => {
      const skillRoot = join(pluginRoot, 'skills');
      await mkdir(join(skillRoot, 'creative'), { recursive: true });
      await writeFile(
        join(skillRoot, 'creative', 'SKILL.md'),
        '---\nname: creative\ndescription: Creative fixture\n---\nCreate fixture content.\n',
        'utf8',
      );
      const launcher = join(pluginRoot, 'launcher');
      await writeFile(launcher, '#!/bin/sh\n', { mode: 0o755 });
      await writeFile(
        join(pluginRoot, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            supported: { command: './launcher' },
            oauth: {
              type: 'http',
              url: 'https://example.test/mcp',
              oauth_resource: 'https://example.test',
            },
          },
        }),
        'utf8',
      );
      const support = createAgentExtensionSupport({ processEnv: {} });

      await expect(
        support.isSupported({
          pluginId: 'creative@market',
          pluginRoot,
          skillRoot,
          mcpServerIds: [],
          appIds: [],
        }),
      ).resolves.toBe(true);
      await expect(support.isSupported(mcpDescriptor(pluginRoot, ['supported']))).resolves.toBe(
        true,
      );
      await expect(support.isSupported(mcpDescriptor(pluginRoot, ['oauth']))).resolves.toBe(false);
      await expect(
        support.isSupported({
          pluginId: 'app-only@market',
          pluginRoot,
          mcpServerIds: [],
          appIds: ['connector'],
        }),
      ).resolves.toBe(false);
    });
  });

  it('projects a validated plugin Skill root into an Agent-ready generation', async () => {
    await withPlugin(async (pluginRoot) => {
      const skillRoot = join(pluginRoot, 'skills');
      await mkdir(join(skillRoot, 'fixture'), { recursive: true });
      await writeFile(
        join(skillRoot, 'fixture', 'SKILL.md'),
        '---\nname: fixture\ndescription: Plugin fixture\n---\nUse the fixture method.\n',
        'utf8',
      );
      const descriptor: AgentExtensionRuntimeDescriptor = {
        pluginId: 'fixture@market',
        pluginRoot,
        skillRoot,
        mcpServerIds: [],
        appIds: [],
      };
      const snapshot: AgentExtensionCatalogSnapshot = {
        records: [],
        runtimeDescriptors: [descriptor],
        diagnostics: [],
      };

      const pluginRuntime = await buildAgentPluginRuntime(snapshot, { processEnv: {} });
      expect(pluginRuntime.skillRoots).toEqual([
        {
          path: skillRoot,
          source: { kind: 'plugin', pluginId: 'fixture@market' },
        },
      ]);
      expect(pluginRuntime.readiness.get('fixture@market')).toEqual({
        status: 'ready',
        diagnosticCode: '',
      });
      await pluginRuntime.dispose();
    });
  });

  it('registers and calls a synthetic plugin MCP Tool through the canonical wrapper', async () => {
    await withPlugin(async (pluginRoot) => {
      const launcher = join(pluginRoot, 'fixture-mcp.mjs');
      await writeFile(
        launcher,
        [
          '#!/usr/bin/env node',
          "import readline from 'node:readline';",
          'const input = readline.createInterface({ input: process.stdin });',
          "input.on('line', (line) => {",
          '  const request = JSON.parse(line);',
          '  if (request.id === undefined) return;',
          "  const result = request.method === 'tools/list'",
          "    ? { tools: [{ name: 'echo', description: 'Echo input', inputSchema: { type: 'object', properties: { value: { type: 'string' } } } }] }",
          "    : request.method === 'tools/call'",
          "      ? { content: [{ type: 'text', text: `echo:${request.params.arguments.value}` }] }",
          '      : {};',
          "  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');",
          '});',
          '',
        ].join('\n'),
        { mode: 0o755 },
      );
      await writeFile(
        join(pluginRoot, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            fixture: {
              command: './fixture-mcp.mjs',
              cwd: '.',
            },
          },
        }),
        'utf8',
      );
      const snapshot: AgentExtensionCatalogSnapshot = {
        records: [],
        runtimeDescriptors: [mcpDescriptor(pluginRoot, ['fixture'])],
        diagnostics: [],
      };

      const pluginRuntime = await buildAgentPluginRuntime(snapshot, {
        processEnv: {
          HOME: process.env['HOME'],
          PATH: process.env['PATH'],
          TMPDIR: process.env['TMPDIR'],
        },
      });
      expect(pluginRuntime.tools.map((tool) => tool.name)).toEqual(['mcp__fixture__echo']);
      await expect(pluginRuntime.tools[0]?.execute({ value: 'hello' })).resolves.toEqual({
        success: true,
        data: 'echo:hello',
        error: undefined,
      });
      expect(pluginRuntime.readiness.get('fixture@market')).toEqual({
        status: 'ready',
        diagnosticCode: '',
      });
      await pluginRuntime.dispose();
    });
  });
});

function mcpDescriptor(
  pluginRoot: string,
  mcpServerIds: readonly string[],
): AgentExtensionRuntimeDescriptor {
  return {
    pluginId: 'fixture@market',
    pluginRoot,
    mcpDocumentPath: join(pluginRoot, '.mcp.json'),
    mcpServerIds,
    appIds: [],
  };
}

async function withPlugin(run: (pluginRoot: string) => Promise<void>): Promise<void> {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'openneko-plugin-runtime-'));
  try {
    await run(pluginRoot);
  } finally {
    await rm(pluginRoot, { recursive: true, force: true });
  }
}
