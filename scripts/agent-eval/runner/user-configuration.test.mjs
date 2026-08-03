import { describe, expect, it } from 'vitest';
import { withCanonicalUserConfiguration } from './user-configuration.mjs';

describe('real API user configuration source', () => {
  it('forces the canonical user TOML and rejects environment path redirection', () => {
    expect(
      withCanonicalUserConfiguration(
        {
          OPENNEKO_AGENT_EVAL_CONFIG_PATH: '/redirected/config.json',
          OPENNEKO_AGENT_EVAL_PROVIDER_ID: 'provider-1',
        },
        '/user-home',
      ),
    ).toEqual({
      OPENNEKO_AGENT_EVAL_CONFIG_PATH: '/user-home/.neko/config.toml',
      OPENNEKO_AGENT_EVAL_PROVIDER_ID: 'provider-1',
    });
  });
});
