import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type {
  AgentExtensionCatalogSnapshot,
  AgentExtensionRuntimeDescriptor,
} from '@neko/agent-contracts';
import {
  buildAgentPluginRuntime,
  disposeAgentPluginRuntimeChanges,
  listChangedAgentPluginRuntimeIds,
  parsePluginMcpDocument,
  reconcileAgentPluginRuntime,
} from './plugin-runtime';

const resolveFixtureModule = createRequire(import.meta.url).resolve;

describe('Desktop plugin runtime', () => {
  it('parses contained stdio command/cwd and only explicitly projected environment', async () => {
    await withPlugin(async (pluginRoot) => {
      await mkdir(join(pluginRoot, 'bin'));
      await writeFile(join(pluginRoot, 'bin', 'launcher'), '#!/bin/sh\n', { mode: 0o755 });
      await writeFile(
        join(pluginRoot, 'mcp.json'),
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
        join(pluginRoot, 'mcp.json'),
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
        join(pluginRoot, 'mcp.json'),
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
        pluginId: 'fixture',
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
          source: { kind: 'plugin', pluginId: 'fixture' },
        },
      ]);
      expect(pluginRuntime.readiness.get('fixture')).toMatchObject({
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
          `import { McpServer } from ${JSON.stringify(pathToFileURL(resolveFixtureModule('@modelcontextprotocol/sdk/server/mcp.js')).href)};`,
          `import { StdioServerTransport } from ${JSON.stringify(pathToFileURL(resolveFixtureModule('@modelcontextprotocol/sdk/server/stdio.js')).href)};`,
          "const server = new McpServer({ name: 'plugin-runtime-fixture', version: '1.0.0' });",
          "server.registerTool('echo', { description: 'Echo fixture' }, async () => ({ content: [{ type: 'text', text: 'echo:hello' }] }));",
          'await server.connect(new StdioServerTransport());',
          '',
        ].join('\n'),
        { mode: 0o755 },
      );
      await writeFile(
        join(pluginRoot, 'mcp.json'),
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
      expect(pluginRuntime.readiness.get('fixture')).toMatchObject({
        status: 'ready',
        diagnosticCode: '',
      });
      await pluginRuntime.dispose();

      const adapterRuntime = await buildAgentPluginRuntime(
        {
          records: [],
          runtimeDescriptors: [
            { ...mcpDescriptor(pluginRoot, ['fixture']), mcpToolExposure: 'adapter-only' },
          ],
          diagnostics: [],
        },
        {
          processEnv: {
            HOME: process.env['HOME'],
            PATH: process.env['PATH'],
            TMPDIR: process.env['TMPDIR'],
          },
        },
      );
      expect(adapterRuntime.tools).toEqual([]);
      expect(adapterRuntime.readiness.get('fixture')).toMatchObject({
        status: 'unsupported',
        diagnosticCode: 'automation-adapter-unavailable',
      });
      await adapterRuntime.dispose();
    });
  });

  it('never starts adapter-only MCP and keeps a sibling generic MCP Tool available', async () => {
    await withPlugin(async (adapterRoot) => {
      await withPlugin(async (genericRoot) => {
        const markerPath = join(adapterRoot, 'adapter-started');
        const adapterLauncher = join(adapterRoot, 'adapter-mcp.mjs');
        await writeFile(
          adapterLauncher,
          [
            '#!/usr/bin/env node',
            "import { writeFileSync } from 'node:fs';",
            `writeFileSync(${JSON.stringify(markerPath)}, 'started', 'utf8');`,
            'process.exit(1);',
            '',
          ].join('\n'),
          { mode: 0o755 },
        );
        await writeFile(
          join(adapterRoot, 'mcp.json'),
          JSON.stringify({
            mcpServers: {
              automation: { command: './adapter-mcp.mjs' },
            },
          }),
          'utf8',
        );

        const genericLauncher = join(genericRoot, 'generic-mcp.mjs');
        await writeFile(
          genericLauncher,
          [
            '#!/usr/bin/env node',
            `import { McpServer } from ${JSON.stringify(pathToFileURL(resolveFixtureModule('@modelcontextprotocol/sdk/server/mcp.js')).href)};`,
            `import { StdioServerTransport } from ${JSON.stringify(pathToFileURL(resolveFixtureModule('@modelcontextprotocol/sdk/server/stdio.js')).href)};`,
            "const server = new McpServer({ name: 'generic-sibling', version: '1.0.0' });",
            "server.registerTool('echo', { description: 'Echo sibling' }, async () => ({ content: [{ type: 'text', text: 'sibling-ready' }] }));",
            'await server.connect(new StdioServerTransport());',
            '',
          ].join('\n'),
          { mode: 0o755 },
        );
        await writeFile(
          join(genericRoot, 'mcp.json'),
          JSON.stringify({
            mcpServers: {
              generic: { command: './generic-mcp.mjs' },
            },
          }),
          'utf8',
        );

        const runtime = await buildAgentPluginRuntime(
          {
            records: [],
            runtimeDescriptors: [
              {
                ...mcpDescriptor(adapterRoot, ['automation'], 'automation'),
                mcpToolExposure: 'adapter-only',
              },
              mcpDescriptor(genericRoot, ['generic'], 'generic'),
            ],
            diagnostics: [],
          },
          {
            processEnv: {
              HOME: process.env['HOME'],
              PATH: process.env['PATH'],
              TMPDIR: process.env['TMPDIR'],
            },
          },
        );

        await expect(readFile(markerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        expect(runtime.tools.map((tool) => tool.name)).toEqual(['mcp__generic__echo']);
        await expect(runtime.tools[0]?.execute({})).resolves.toMatchObject({
          success: true,
          data: 'sibling-ready',
        });
        expect(runtime.readiness.get('automation')).toMatchObject({
          status: 'unsupported',
          diagnosticCode: 'automation-adapter-unavailable',
        });
        expect(runtime.readiness.get('generic')).toMatchObject({
          status: 'ready',
          diagnosticCode: '',
        });
        await runtime.dispose();
      });
    });
  });

  it('registers a product adapter Tool without exposing its raw MCP and replaces it by source identity', async () => {
    await withPlugin(async (pluginRoot) => {
      const descriptor = {
        ...mcpDescriptor(pluginRoot, ['automation'], 'automation'),
        mcpToolExposure: 'adapter-only' as const,
      };
      const snapshot: AgentExtensionCatalogSnapshot = {
        records: [],
        runtimeDescriptors: [descriptor],
        diagnostics: [],
      };
      let runtimeId = 'runtime-one';
      let disposed = 0;
      const toolAdapters = {
        async build(input: AgentExtensionRuntimeDescriptor) {
          expect(input).toEqual(descriptor);
          const capturedRuntimeId = runtimeId;
          return {
            sourceFingerprint: capturedRuntimeId,
            tools: [
              {
                name: 'computer_use__verify_state',
                description: 'Observe the selected window.',
                parameters: { type: 'object' as const, properties: {} },
                execute: async () => ({ success: true, data: capturedRuntimeId }),
              },
            ],
            readiness: {
              status: 'ready' as const,
              diagnosticCode: '',
              componentReadiness: {
                skills: { status: 'absent' as const, diagnosticCode: '' },
                mcp: { status: 'ready' as const, diagnosticCode: '' },
                apps: { status: 'absent' as const, diagnosticCode: '' },
              },
            },
            async dispose() {
              disposed += 1;
            },
          };
        },
      };

      const initial = await buildAgentPluginRuntime(snapshot, { toolAdapters });
      expect(initial.tools.map((tool) => tool.name)).toEqual(['computer_use__verify_state']);
      expect(initial.readiness.get('automation')).toMatchObject({
        status: 'ready',
        diagnosticCode: '',
      });

      const retained = await reconcileAgentPluginRuntime(initial, snapshot, { toolAdapters });
      expect(retained.contributions.get('automation')).toBe(
        initial.contributions.get('automation'),
      );
      expect(disposed).toBe(1);

      runtimeId = 'runtime-two';
      const replaced = await reconcileAgentPluginRuntime(retained, snapshot, { toolAdapters });
      expect(listChangedAgentPluginRuntimeIds(retained, replaced)).toEqual(['automation']);
      await disposeAgentPluginRuntimeChanges(retained, replaced);
      await expect(replaced.tools[0]?.execute({})).resolves.toMatchObject({
        success: true,
        data: 'runtime-two',
      });
      expect(disposed).toBe(2);
      await replaced.dispose();
      expect(disposed).toBe(3);
    });
  });

  it('replaces and closes only the changed extension child runtime', async () => {
    await withPlugin(async (firstRoot) => {
      await withPlugin(async (updatedRoot) => {
        await withPlugin(async (siblingRoot) => {
          await writeEchoMcp(firstRoot, 'first', 'first-old');
          await writeEchoMcp(updatedRoot, 'first', 'first-new');
          await writeEchoMcp(siblingRoot, 'sibling', 'sibling-ready');
          const initialSnapshot: AgentExtensionCatalogSnapshot = {
            records: [],
            runtimeDescriptors: [
              mcpDescriptor(firstRoot, ['first'], 'first@market'),
              mcpDescriptor(siblingRoot, ['sibling'], 'sibling'),
            ],
            diagnostics: [],
          };
          const initial = await buildAgentPluginRuntime(initialSnapshot, {
            processEnv: fixtureProcessEnv(),
          });
          const previousFirstTool = initial.contributions.get('first@market')?.tools[0];
          const previousSibling = initial.contributions.get('sibling');
          const next = await reconcileAgentPluginRuntime(
            initial,
            {
              records: [],
              runtimeDescriptors: [
                mcpDescriptor(updatedRoot, ['first'], 'first@market'),
                mcpDescriptor(siblingRoot, ['sibling'], 'sibling'),
              ],
              diagnostics: [],
            },
            { processEnv: fixtureProcessEnv() },
          );

          expect(listChangedAgentPluginRuntimeIds(initial, next)).toEqual(['first@market']);
          expect(next.contributions.get('sibling')).toBe(previousSibling);
          await disposeAgentPluginRuntimeChanges(initial, next);
          await expect(previousFirstTool?.execute({})).resolves.toMatchObject({
            success: false,
            error: 'MCP server first is not connected',
          });
          await expect(
            next.contributions.get('first@market')?.tools[0]?.execute({}),
          ).resolves.toMatchObject({
            success: true,
            data: 'first-new',
          });
          await expect(previousSibling?.tools[0]?.execute({})).resolves.toMatchObject({
            success: true,
            data: 'sibling-ready',
          });
          await next.dispose();
        });
      });
    });
  });

  it('discards a conflicting child candidate without replacing the authoritative sibling', async () => {
    await withPlugin(async (siblingRoot) => {
      await withPlugin(async (conflictRoot) => {
        await writeEchoMcp(siblingRoot, 'shared', 'authoritative');
        await writeEchoMcp(conflictRoot, 'shared', 'candidate');
        const initial = await buildAgentPluginRuntime(
          {
            records: [],
            runtimeDescriptors: [mcpDescriptor(siblingRoot, ['shared'], 'sibling')],
            diagnostics: [],
          },
          { processEnv: fixtureProcessEnv() },
        );

        await expect(
          reconcileAgentPluginRuntime(
            initial,
            {
              records: [],
              runtimeDescriptors: [
                mcpDescriptor(siblingRoot, ['shared'], 'sibling'),
                mcpDescriptor(conflictRoot, ['shared'], 'candidate@market'),
              ],
              diagnostics: [],
            },
            { processEnv: fixtureProcessEnv() },
          ),
        ).rejects.toThrow("conflict would replace authoritative contribution 'sibling'");
        await expect(initial.tools[0]?.execute({})).resolves.toMatchObject({
          success: true,
          data: 'authoritative',
        });
        await initial.dispose();
      });
    });
  });

  it('isolates initial MCP server conflicts without starting either child', async () => {
    await withPlugin(async (firstRoot) => {
      await withPlugin(async (secondRoot) => {
        const firstMarker = join(firstRoot, 'started');
        const secondMarker = join(secondRoot, 'started');
        await writeEchoMcp(firstRoot, 'shared', 'first', firstMarker);
        await writeEchoMcp(secondRoot, 'shared', 'second', secondMarker);
        const runtime = await buildAgentPluginRuntime(
          {
            records: [],
            runtimeDescriptors: [
              mcpDescriptor(firstRoot, ['shared'], 'first@market'),
              mcpDescriptor(secondRoot, ['shared'], 'second@market'),
            ],
            diagnostics: [],
          },
          { processEnv: fixtureProcessEnv() },
        );

        expect(runtime.tools).toEqual([]);
        expect(runtime.readiness.get('first@market')).toMatchObject({
          status: 'error',
          diagnosticCode: 'mcp-server-conflict',
        });
        expect(runtime.readiness.get('second@market')).toMatchObject({
          status: 'error',
          diagnosticCode: 'mcp-server-conflict',
        });
        await expect(readFile(firstMarker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(readFile(secondMarker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        await runtime.dispose();
      });
    });
  });
});

async function writeEchoMcp(
  pluginRoot: string,
  serverId: string,
  response: string,
  startMarker?: string,
): Promise<void> {
  const launcher = join(pluginRoot, `${serverId}-mcp.mjs`);
  await writeFile(
    launcher,
    [
      '#!/usr/bin/env node',
      ...(startMarker
        ? [
            "import { writeFileSync } from 'node:fs';",
            `writeFileSync(${JSON.stringify(startMarker)}, 'started', 'utf8');`,
          ]
        : []),
      `import { McpServer } from ${JSON.stringify(pathToFileURL(resolveFixtureModule('@modelcontextprotocol/sdk/server/mcp.js')).href)};`,
      `import { StdioServerTransport } from ${JSON.stringify(pathToFileURL(resolveFixtureModule('@modelcontextprotocol/sdk/server/stdio.js')).href)};`,
      `const server = new McpServer({ name: ${JSON.stringify(serverId)}, version: '1.0.0' });`,
      `server.registerTool('echo', { description: 'Echo fixture' }, async () => ({ content: [{ type: 'text', text: ${JSON.stringify(response)} }] }));`,
      'await server.connect(new StdioServerTransport());',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  await writeFile(
    join(pluginRoot, 'mcp.json'),
    JSON.stringify({
      mcpServers: {
        [serverId]: { command: `./${serverId}-mcp.mjs`, cwd: '.' },
      },
    }),
    'utf8',
  );
}

function fixtureProcessEnv(): Readonly<NodeJS.ProcessEnv> {
  return {
    HOME: process.env['HOME'],
    PATH: process.env['PATH'],
    TMPDIR: process.env['TMPDIR'],
  };
}

function mcpDescriptor(
  pluginRoot: string,
  mcpServerIds: readonly string[],
  pluginId = 'fixture',
): AgentExtensionRuntimeDescriptor {
  return {
    pluginId,
    pluginRoot,
    mcpDocumentPath: join(pluginRoot, 'mcp.json'),
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
