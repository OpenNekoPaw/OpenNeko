import { describe, expect, it } from 'vitest';
import type { MCPServerConfig } from '@neko/shared';
import { MCPManager } from '../../mcp/mcp-manager';
import { createMcpExternalResearchProvider } from '../capability/mcp-external-research-provider';

const runHarness = process.env['NEKO_EXTERNAL_RESEARCH_MCP_HARNESS'] === '1';

const describeHarness = runHarness ? describe : describe.skip;

describeHarness('MCP external research provider harness', () => {
  it('runs WebSearch through a configured real MCP server', async () => {
    const serverId = readEnv('NEKO_EXTERNAL_RESEARCH_MCP_SERVER_ID');
    const command = readEnv('NEKO_EXTERNAL_RESEARCH_MCP_COMMAND');
    const searchTool = readEnv('NEKO_EXTERNAL_RESEARCH_MCP_SEARCH_TOOL');
    const queryArg = process.env['NEKO_EXTERNAL_RESEARCH_MCP_QUERY_ARG'] ?? 'query';
    const maxResultsArg = process.env['NEKO_EXTERNAL_RESEARCH_MCP_MAX_RESULTS_ARG'] ?? 'maxResults';
    const query =
      process.env['NEKO_EXTERNAL_RESEARCH_MCP_QUERY'] ?? 'OpenNeko external research harness';

    const manager = new MCPManager();
    manager.register({
      id: serverId,
      name: serverId,
      description: 'External research MCP harness server',
      category: 'api',
      transport: 'stdio',
      command,
      args: readJsonArrayEnv('NEKO_EXTERNAL_RESEARCH_MCP_ARGS'),
      env: readJsonObjectEnv('NEKO_EXTERNAL_RESEARCH_MCP_ENV'),
      enabled: true,
    } satisfies MCPServerConfig);

    try {
      await manager.connectAll();
      const provider = createMcpExternalResearchProvider({
        config: {
          serverId,
          searchTool: {
            name: searchTool,
            queryArg,
            maxResultsArg,
            outputSchema: 'neko.externalResearch.search.v1',
          },
        },
        mcpManager: manager,
      });

      const result = await provider.search(
        { query, mode: 'indexed', maxResults: 2 },
        new AbortController().signal,
      );

      expect(result.providerId).toBe(`mcp:${serverId}`);
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources[0]?.url).toMatch(/^https?:\/\//);
    } finally {
      await manager.disconnectAll();
    }
  });
});

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when NEKO_EXTERNAL_RESEARCH_MCP_HARNESS=1.`);
  }
  return value;
}

function readJsonArrayEnv(name: string): string[] | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${name} must be a JSON array of strings.`);
  }
  return parsed;
}

function readJsonObjectEnv(name: string): Record<string, string> | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!isStringRecord(parsed)) {
    throw new Error(`${name} must be a JSON object with string values.`);
  }
  return parsed;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}
