import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_CONFIG } from '@neko/platform';
import { parseTomlConfigText } from '@neko/shared';
import { buildUserConfigTemplate } from './configFileHandler';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('ConfigFileHandler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the NewAPI/local MVP default config as the new file template', () => {
    const template = buildUserConfigTemplate();

    expect(parseTomlConfigText(template)).toEqual(DEFAULT_USER_CONFIG);
    expect(template).toContain('# Provider fields:');
    expect(template).toContain('protocol_profile: "newapi", "openai-chat"');
    expect(template).toContain('DeepSeek direct');
    expect(template).toContain(
      'protocol_profile: optional request protocol override for gateway models',
    );
    expect(template).toContain('[[providers]]');
  });
});
