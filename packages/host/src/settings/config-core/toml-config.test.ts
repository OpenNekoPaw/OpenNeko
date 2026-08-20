import { describe, expect, it } from 'vitest';
import { projectTomlConfig, serializeUnifiedConfigToToml } from './toml-config';

describe('retired Agent TOML configuration', () => {
  it('rejects retired Host MCP and external research fields without dropping valid siblings', () => {
    const projection = projectTomlConfig({
      defaults: { max_tokens: 4096 },
      mcp_servers: [{ id: 'retired-server' }],
      external_research: { mode: 'live' },
    });

    expect(projection.config).toEqual({ maxTokens: 4096 });
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalidConfigField', path: 'mcp_servers' }),
      expect.objectContaining({ code: 'invalidConfigField', path: 'external_research' }),
    ]);
  });

  it('does not serialize retired Host Agent configuration fields', () => {
    const toml = serializeUnifiedConfigToToml({ maxTokens: 4096 });

    expect(toml).not.toContain('mcp_servers');
    expect(toml).not.toContain('external_research');
  });
});
