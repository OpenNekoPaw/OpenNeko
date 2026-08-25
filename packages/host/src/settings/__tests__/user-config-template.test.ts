import { describe, expect, it } from 'vitest';
import { parseTomlConfigText } from '../config-core/index';
import { DEFAULT_USER_CONFIG } from '../default-config';
import { buildUserConfigTemplate } from '../user-config-template';

describe('user config template', () => {
  it('documents supported config values while preserving the default config payload', () => {
    const template = buildUserConfigTemplate();

    expect(parseTomlConfigText(template)).toEqual(DEFAULT_USER_CONFIG);
    expect(template).toContain('type: "openai", "anthropic", "google"');
    expect(template).toContain('connection_kind: "gateway", "local", "direct"');
    expect(template).toContain(
      'protocol_profile: use a protocol advertised by the connected DSH runtime',
    );
    expect(template).toContain('auth_type: "bearer", "api-key", "custom-header"');
    expect(template).toContain('stream_format: "sse", "ndjson"');
    expect(template).toContain('DSH catalog route');
    expect(template).toContain('openai-completions');
    expect(template).toContain('anthropic-messages');
    expect(template).toContain('Media understanding uses the selected Agent model');
    expect(template).toContain(
      'protocol_profile: optional request protocol override for gateway models',
    );
  });
});
