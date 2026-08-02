/**
 * NewAPI Speech Model - SpeechModelV3 implementation for NewAPI/OneAPI
 *
 * Uses the OpenAI-compatible /v1/audio/speech endpoint.
 */

import type { SpeechModelV3, SpeechModelV3CallOptions, SharedV3Warning } from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';

export class NewAPISpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'newapi';
  readonly modelId: string;

  private config: ProviderConfig;

  constructor(modelId: string, config: ProviderConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate(options: SpeechModelV3CallOptions): Promise<{
    audio: string | Uint8Array;
    warnings: Array<SharedV3Warning>;
    request?: { body?: unknown };
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
  }> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v1/audio/speech`;

    const body: Record<string, unknown> = {
      model: this.modelId,
      input: options.text,
    };

    if (options.voice) body.voice = options.voice;
    if (options.outputFormat) body.response_format = options.outputFormat;
    if (options.speed) body.speed = options.speed;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(options.headers as Record<string, string>),
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NewAPI speech generation failed (${response.status}): ${errorBody}`);
    }

    // Response is raw audio binary
    const audioBuffer = await response.arrayBuffer();
    const audio = new Uint8Array(audioBuffer);

    return {
      audio,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  private getBaseUrl(): string {
    let base = this.config.apiUrl.replace(/\/+$/, '');
    base = base.replace(/\/v1$/, '');
    return base;
  }
}
