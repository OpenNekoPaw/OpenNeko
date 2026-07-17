import { describe, expect, it } from 'vitest';
import {
  buildTuiMediaModelMetadata,
  buildTuiPerceptionModelMetadata,
  mergeTuiMediaModelMetadata,
} from './media-model-metadata';

describe('TUI media model metadata', () => {
  it('normalizes default media model option ids into runtime provider/model refs', () => {
    expect(
      buildTuiMediaModelMetadata(
        {
          image: 'openai:gpt-image-1',
          video: 'runway/gen-4',
          audio: 'none',
        },
        'anthropic',
      ),
    ).toEqual({
      image: { providerId: 'openai', modelId: 'gpt-image-1' },
      video: { providerId: 'runway', modelId: 'gen-4' },
    });
  });

  it('uses the current chat provider for legacy bare media model ids', () => {
    expect(buildTuiMediaModelMetadata({ image: 'gpt-image-1' }, 'openai')).toEqual({
      image: { providerId: 'openai', modelId: 'gpt-image-1' },
    });
  });

  it('projects provider expression profile ids from model options', () => {
    expect(
      buildTuiMediaModelMetadata({ image: 'openai:gpt-image-1' }, 'anthropic', [
        {
          id: 'openai:gpt-image-1',
          label: 'OpenAI / GPT Image',
          providerId: 'openai',
          modelId: 'gpt-image-1',
          category: 'image',
          providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
        },
      ]),
    ).toEqual({
      image: {
        providerId: 'openai',
        modelId: 'gpt-image-1',
        providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      },
    });
  });

  it('preserves existing execution metadata while injecting media models', () => {
    expect(
      mergeTuiMediaModelMetadata(
        {
          requestContext: { source: 'explicit-user' },
          traceId: 'trace-1',
        },
        { image: 'openai:gpt-image-1' },
        'anthropic',
      ),
    ).toEqual({
      requestContext: { source: 'explicit-user' },
      traceId: 'trace-1',
      mediaModels: {
        image: { providerId: 'openai', modelId: 'gpt-image-1' },
      },
    });
  });

  it('injects media models when no execution metadata exists yet', () => {
    expect(
      mergeTuiMediaModelMetadata(undefined, { image: 'openai:gpt-image-1' }, 'anthropic'),
    ).toEqual({
      mediaModels: {
        image: { providerId: 'openai', modelId: 'gpt-image-1' },
      },
    });
  });

  it('normalizes perception model option ids into understanding model refs', () => {
    expect(
      buildTuiPerceptionModelMetadata({ image: 'google:gemini-flash' }, 'anthropic', [
        {
          id: 'google:gemini-flash',
          label: 'Google / Gemini Flash',
          providerId: 'google',
          modelId: 'gemini-flash',
          category: 'llm',
          capabilities: ['chat', 'vision'],
          providerExpressionProfileId: 'provider-expression:google:gemini-flash',
        },
      ]),
    ).toEqual({
      image: {
        providerId: 'google',
        modelId: 'gemini-flash',
        category: 'llm',
        providerExpressionProfileId: 'provider-expression:google:gemini-flash',
      },
    });
  });

  it('injects perception models as understandingModels execution metadata', () => {
    expect(
      mergeTuiMediaModelMetadata(
        { traceId: 'trace-1' },
        { image: 'openai:gpt-image-1' },
        'anthropic',
        [
          {
            id: 'openai:gpt-image-1',
            label: 'OpenAI / GPT Image',
            providerId: 'openai',
            modelId: 'gpt-image-1',
            category: 'image',
          },
          {
            id: 'google:gemini-flash',
            label: 'Google / Gemini Flash',
            providerId: 'google',
            modelId: 'gemini-flash',
            category: 'llm',
            capabilities: ['chat', 'vision_video'],
          },
        ],
        { video: 'google:gemini-flash' },
      ),
    ).toEqual({
      traceId: 'trace-1',
      mediaModels: {
        image: { providerId: 'openai', modelId: 'gpt-image-1' },
      },
      understandingModels: {
        video: { providerId: 'google', modelId: 'gemini-flash', category: 'llm' },
      },
    });
  });
});
