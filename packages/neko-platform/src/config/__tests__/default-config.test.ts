import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@neko/shared';
import {
  CUSTOM_NEWAPI_PROVIDER_ID,
  DEFAULT_USER_CONFIG,
  GOOGLE_GEMINI_MEDIA_UNDERSTAND_MODEL_ID,
  GOOGLE_PROVIDER_ID,
  NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
  NEKO_GATEWAY_PROVIDER_ID,
  OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID,
  OLLAMA_LOCAL_PROVIDER_ID,
} from '../default-config';
import { modelSupportsPurpose } from '../model-purpose-registry';

describe('default agent provider configuration', () => {
  it('uses NewAPI gateway and local provider groups by default', () => {
    expect(DEFAULT_USER_CONFIG.defaultProvider).toBe(OLLAMA_LOCAL_PROVIDER_ID);
    expect(DEFAULT_USER_CONFIG.defaultModel).toBe(OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID);
    expect(DEFAULT_CONFIG.defaultProvider).toBe(OLLAMA_LOCAL_PROVIDER_ID);
    expect(DEFAULT_CONFIG.defaultModel).toBe(OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID);

    const providers = new Map(
      DEFAULT_USER_CONFIG.providers?.map((provider) => [provider.id, provider]),
    );

    expect(providers.get(NEKO_GATEWAY_PROVIDER_ID)).toMatchObject({
      type: 'newapi',
      connectionKind: 'gateway',
      protocolProfile: 'newapi',
      supportLevel: 'verified',
      requiresApiKey: true,
    });
    expect(providers.get(CUSTOM_NEWAPI_PROVIDER_ID)).toMatchObject({
      type: 'newapi',
      connectionKind: 'gateway',
      protocolProfile: 'newapi',
      supportLevel: 'custom',
      enabled: false,
    });
    expect(providers.get(OLLAMA_LOCAL_PROVIDER_ID)).toMatchObject({
      type: 'ollama',
      connectionKind: 'local',
      protocolProfile: 'ollama',
      requiresApiKey: false,
    });
    expect(providers.get(GOOGLE_PROVIDER_ID)).toMatchObject({
      type: 'google',
      connectionKind: 'direct',
      protocolProfile: 'google',
      supportLevel: 'verified',
      enabled: false,
      requiresApiKey: true,
    });
  });

  it('uses canonical provider/model refs for default models by type', () => {
    const models = new Map(DEFAULT_USER_CONFIG.models?.map((model) => [model.id, model]));

    expect(DEFAULT_USER_CONFIG.defaultModels).toEqual({
      llm: {
        providerId: NEKO_GATEWAY_PROVIDER_ID,
        modelId: NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID,
      },
      image: {
        providerId: NEKO_GATEWAY_PROVIDER_ID,
        modelId: NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
      },
      video: {
        providerId: NEKO_GATEWAY_PROVIDER_ID,
        modelId: NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
      },
      audio: {
        providerId: NEKO_GATEWAY_PROVIDER_ID,
        modelId: NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
      },
    });

    for (const modelRef of Object.values(DEFAULT_USER_CONFIG.defaultModels ?? {})) {
      expect(modelRef.providerId).toBe(NEKO_GATEWAY_PROVIDER_ID);
      expect(models.has(modelRef.modelId)).toBe(true);
    }

    expect(models.get(NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID)).toMatchObject({
      type: 'audio',
      capabilities: expect.arrayContaining(['text_to_music']),
    });
    const musicModel = models.get(NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID);
    expect(musicModel).toBeDefined();
    if (!musicModel) throw new Error('Expected default music model');
    expect(modelSupportsPurpose(musicModel, 'audio.music.generate')).toBe(true);

    const geminiVideoModel = models.get(GOOGLE_GEMINI_MEDIA_UNDERSTAND_MODEL_ID);
    expect(geminiVideoModel).toMatchObject({
      providerId: GOOGLE_PROVIDER_ID,
      type: 'llm',
      enabled: false,
      capabilities: expect.arrayContaining(['vision', 'audio', 'vision_video', 'llm.chat']),
    });
    if (!geminiVideoModel) throw new Error('Expected default Gemini media understanding model');
    expect(modelSupportsPurpose(geminiVideoModel, 'image.understand')).toBe(true);
    expect(modelSupportsPurpose(geminiVideoModel, 'audio.understand')).toBe(true);
    expect(modelSupportsPurpose(geminiVideoModel, 'video.understand')).toBe(true);
  });
});
