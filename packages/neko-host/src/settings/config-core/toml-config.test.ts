import { describe, expect, it } from 'vitest';
import { parseTomlConfigText, serializeUnifiedConfigToToml } from './toml-config';

describe('external research TOML config', () => {
  it('parses external research MCP mapping', () => {
    const config = parseTomlConfigText(`
[external_research]
mode = "live"
provider_id = "mcp:research"
require_approval_for_live = true
allow_project_context_in_query = false
max_results = 7
max_fetch_content_tokens = 9000
allowed_domains = ["docs.example.com"]

[external_research.mcp]
server_id = "research"
expose_bound_tools_as_raw_mcp = false

[external_research.mcp.search_tool]
name = "web_search"
query_arg = "query"
max_results_arg = "limit"
allowed_domains_arg = "allowed_domains"
output_schema = "neko.externalResearch.search.v1"

[external_research.mcp.fetch_tool]
name = "fetch_url"
url_arg = "url"
max_content_tokens_arg = "max_tokens"
output_schema = "neko.externalResearch.fetch.v1"
`);

    expect(config.externalResearch).toEqual({
      mode: 'live',
      providerId: 'mcp:research',
      requireApprovalForLive: true,
      allowProjectContextInQuery: false,
      maxResults: 7,
      maxFetchContentTokens: 9000,
      allowedDomains: ['docs.example.com'],
      mcp: {
        serverId: 'research',
        exposeBoundToolsAsRawMcp: false,
        searchTool: {
          name: 'web_search',
          queryArg: 'query',
          maxResultsArg: 'limit',
          allowedDomainsArg: 'allowed_domains',
          outputSchema: 'neko.externalResearch.search.v1',
        },
        fetchTool: {
          name: 'fetch_url',
          urlArg: 'url',
          maxContentTokensArg: 'max_tokens',
          outputSchema: 'neko.externalResearch.fetch.v1',
        },
      },
    });
  });

  it('serializes external research config using snake_case TOML fields', () => {
    const toml = serializeUnifiedConfigToToml({
      externalResearch: {
        mode: 'indexed',
        providerId: 'mcp:research',
        maxResults: 5,
        mcp: {
          serverId: 'research',
          searchTool: {
            name: 'web_search',
            queryArg: 'query',
            outputSchema: 'neko.externalResearch.search.v1',
          },
        },
      },
    });

    expect(toml).toContain('[external_research]');
    expect(toml).toContain('provider_id = "mcp:research"');
    expect(toml).toContain('[external_research.mcp.search_tool]');
    expect(toml).toContain('query_arg = "query"');
  });
});
