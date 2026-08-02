import { describe, expect, it } from 'vitest';
import { NewAPIVideoModel } from './newapi-video-model';

describe('NewAPIVideoModel', () => {
  it('fails visibly before issuing a request when prompt is missing', async () => {
    const model = new NewAPIVideoModel('sora-compatible', {
      apiUrl: 'https://gateway.example.test',
      apiKey: 'test-key',
    });

    await expect(
      model.doGenerate({
        prompt: undefined,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        image: undefined,
        providerOptions: {},
      }),
    ).rejects.toThrow('NewAPI video generation requires a prompt.');
  });
});
