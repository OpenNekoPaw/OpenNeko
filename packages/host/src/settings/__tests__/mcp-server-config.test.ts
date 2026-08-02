import { describe, expect, it } from 'vitest';
import {
  MCP_CONFIGURATION_UNAVAILABLE_MESSAGE,
  buildMCPStdioServerPreset,
  parseMCPArgsInput,
  runAddMCPStdioServerRuntime,
} from '../mcp-server-config';

describe('mcp-server-config', () => {
  it('builds a user stdio MCP server preset', () => {
    expect(
      buildMCPStdioServerPreset({
        id: 'filesystem',
        name: 'Filesystem',
        command: 'npx mcp-server',
        argsInput: '/tmp, --readonly',
      }),
    ).toEqual({
      id: 'filesystem',
      name: 'Filesystem',
      description: 'Custom MCP server: Filesystem',
      category: 'other',
      transport: 'stdio',
      command: 'npx mcp-server',
      args: ['/tmp', '--readonly'],
      enabled: true,
    });
  });

  it('trims empty MCP args', () => {
    expect(parseMCPArgsInput(' /tmp, , --debug,')).toEqual(['/tmp', '--debug']);
  });

  it('stores an MCP stdio server through the runtime', async () => {
    const stored: unknown[] = [];

    const result = await runAddMCPStdioServerRuntime(
      {
        serverName: ' Filesystem ',
        command: ' npx -y @modelcontextprotocol/server-filesystem ',
        argsInput: ' /tmp, --readonly ',
      },
      {
        setMCPServer: async (server) => {
          stored.push(server);
        },
      },
    );

    expect(result).toEqual({
      status: 'added',
      server: {
        id: 'Filesystem',
        name: 'Filesystem',
        description: 'Custom MCP server: Filesystem',
        category: 'other',
        transport: 'stdio',
        command: 'npx -y @modelcontextprotocol/server-filesystem',
        args: ['/tmp', '--readonly'],
        enabled: true,
      },
      message: 'MCP Server "Filesystem" added successfully.',
    });
    expect(stored).toEqual([result.status === 'added' ? result.server : undefined]);
  });

  it('cancels when required MCP input is missing', async () => {
    await expect(runAddMCPStdioServerRuntime({}, undefined)).resolves.toEqual({
      status: 'cancelled',
      reason: 'missingName',
    });
    await expect(
      runAddMCPStdioServerRuntime({ serverName: 'server', command: ' ' }, undefined),
    ).resolves.toEqual({
      status: 'cancelled',
      reason: 'missingCommand',
    });
  });

  it('reports unavailable config before building MCP server writes', async () => {
    await expect(
      runAddMCPStdioServerRuntime({ serverName: 'server', command: 'npx server' }, undefined),
    ).resolves.toEqual({
      status: 'unavailable',
      message: MCP_CONFIGURATION_UNAVAILABLE_MESSAGE,
    });
  });

  it('projects MCP server write failures', async () => {
    await expect(
      runAddMCPStdioServerRuntime(
        { serverName: 'server', command: 'npx server' },
        {
          setMCPServer: async () => {
            throw new Error('disk denied');
          },
        },
      ),
    ).resolves.toEqual({
      status: 'failed',
      message: 'Failed to add MCP server: disk denied',
    });
  });
});
