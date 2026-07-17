import { describe, expect, it, vi } from 'vitest';
import { callJudgeProvider } from './provider-adapter.mjs';

const PROFILE = {
  id: 'quality-judge',
  adapter: 'openai-chat-completions-v1',
  providerId: 'judge-provider',
  modelId: 'judge-model',
  endpointEnv: 'JUDGE_ENDPOINT',
  apiKeyEnv: 'JUDGE_API_KEY',
  temperature: 0,
  maxTokens: 1000,
  timeoutMs: 1000,
};

describe('external Judge provider adapter', () => {
  it('calls the configured external API without exposing credentials in the result', async () => {
    const fetch = vi.fn(async (_url, init) => ({
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: '{"score":4}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        };
      },
      request: init,
    }));
    const result = await callJudgeProvider(
      PROFILE,
      { system: 'Return JSON.', user: 'Evaluate public evidence.' },
      {
        env: { JUDGE_ENDPOINT: 'https://judge.example/v1', JUDGE_API_KEY: 'secret-value' },
        fetch,
      },
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://judge.example/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(result).toMatchObject({
      providerId: 'judge-provider',
      modelId: 'judge-model',
      content: '{"score":4}',
      usage: { inputTokens: 12, outputTokens: 4 },
    });
  });

  it('classifies missing configuration, provider failure, and malformed output', async () => {
    await expect(
      callJudgeProvider(PROFILE, { system: 's', user: 'u' }, { env: {} }),
    ).rejects.toMatchObject({ code: 'judge-infrastructure-fail' });
    await expect(
      callJudgeProvider(PROFILE, { system: 's', user: 'u' }, {
        env: { JUDGE_ENDPOINT: 'https://judge.example/v1', JUDGE_API_KEY: 'key' },
        fetch: async () => ({ ok: false, status: 429 }),
      }),
    ).rejects.toMatchObject({ code: 'judge-infrastructure-fail' });
    await expect(
      callJudgeProvider(PROFILE, { system: 's', user: 'u' }, {
        env: { JUDGE_ENDPOINT: 'https://judge.example/v1', JUDGE_API_KEY: 'key' },
        fetch: async () => ({ ok: true, json: async () => ({ choices: [] }) }),
      }),
    ).rejects.toMatchObject({ code: 'judge-malformed' });
  });
});
