import { describe, expect, it } from 'vitest';
import { NewAPIVideoModel } from './newapi-video-model';

describe('NewAPIVideoModel', () => {
  it('fails visibly before issuing a request when prompt is missing', async () => {
    const model = new NewAPIVideoModel('sora-compatible', {
      apiUrl: 'https://gateway.example.test',
      apiKey: 'test-key',
    });

    await expect(
      model.doStart({
        prompt: undefined,
        n: 1,
        aspectRatio: undefined,
        resolution: undefined,
        duration: undefined,
        fps: undefined,
        seed: undefined,
        image: undefined,
        frameImages: undefined,
        inputReferences: undefined,
        generateAudio: undefined,
        providerOptions: {},
      }),
    ).rejects.toThrow('NewAPI video generation requires a non-empty prompt.');
  });
});
