import { describe, expect, it } from 'vitest';
import { parseTomlConfigText } from '@neko/shared';
import { DEFAULT_USER_CONFIG } from '../default-config';
import { buildUserConfigTemplate } from '../user-config-template';

describe('user config template', () => {
  it('documents supported config values while preserving the default config payload', () => {
    const template = buildUserConfigTemplate();

    expect(parseTomlConfigText(template)).toEqual(DEFAULT_USER_CONFIG);
    expect(template).toContain('type: "openai", "anthropic", "google"');
    expect(template).toContain('connection_kind: "gateway", "local", "direct"');
    expect(template).toContain('protocol_profile: "newapi", "openai-chat", "openai-responses"');
    expect(template).toContain('auth_type: "bearer", "api-key", "custom-header"');
    expect(template).toContain('stream_format: "sse", "ndjson"');
    expect(template).toContain('DeepSeek direct');
    expect(template).toContain('Gemini direct');
    expect(template).toContain(
      '[default_model_purposes.image_understand/audio_understand/video_understand]',
    );
    expect(template).toContain(
      'protocol_profile: optional request protocol override for gateway models',
    );
  });
});
