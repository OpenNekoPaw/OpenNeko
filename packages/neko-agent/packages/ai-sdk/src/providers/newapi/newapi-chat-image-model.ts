/**
 * NewAPI Chat Image Model - ImageModelV3 implementation using Chat Completions
 *
 * ⚠ EXPERIMENTAL / PROVIDER-SPECIFIC.
 *
 * The OpenAI-compatible Chat Completions spec documents `modalities: ['text']`
 * and `modalities: ['text','audio']` for output; `['text','image']` is NOT part
 * of the documented contract. Standard NewAPI/OneAPI proxies may reject this
 * request shape or return text-only responses (which this model treats as an
 * error — see `doGenerate`).
 *
 * This implementation targets a narrow set of providers that **are** known to
 * return images in chat responses under provider-specific extensions:
 *   - Gemini 2.0+ native image generation (via direct Google endpoint)
 *   - GPT-image in chat mode (where available via proxy)
 *   - Some NewAPI deployments that route to image-capable backends
 *
 * For spec-compliant image generation, prefer `NewAPIImageModel`, which uses
 * `/v1/images/generations` for text-to-image and `/v1/images/edits` for
 * inpainting. This chat path is retained for multimodal LLMs where image
 * output is intertwined with reasoning.
 */

import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';

/** Chat completions response format */
interface ChatCompletionResponse {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | ContentPart[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Content part in multimodal response */
type ContentPart = TextPart | ImageUrlPart | InlineImagePart;

interface TextPart {
  type: 'text';
  text: string;
}

interface ImageUrlPart {
  type: 'image_url';
  image_url: { url: string };
}

interface InlineImagePart {
  type: 'image';
  data?: string;
  source?: { type: 'base64'; media_type: string; data: string };
}

export class NewAPIChatImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'newapi-chat';
  readonly modelId: string;
  readonly maxImagesPerCall = 1;

  private config: ProviderConfig;

  constructor(modelId: string, config: ProviderConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate(options: ImageModelV3CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: ImageModelV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
    usage?: ImageModelV3Usage;
  }> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v1/chat/completions`;

    // Forward ControlNet / IP-Adapter / reference / mask / edit fields as multimodal
    // content parts so chat-style image models (Gemini, GPT-image) receive the visual
    // context along with the text prompt.
    const nekoExtras =
      (options.providerOptions?.['neko'] as Record<string, unknown> | undefined) ?? {};

    // ── Text: prompt + edit/negative/style/control semantics ────────────────
    const textPieces: string[] = [options.prompt ?? ''];
    const editInstruction = nekoExtras['editInstruction'] as string | undefined;
    const negativePrompt = nekoExtras['negativePrompt'] as string | undefined;
    const style = nekoExtras['style'] as string | undefined;
    const controlMode = nekoExtras['controlMode'] as string | undefined;
    const controlStrength = nekoExtras['controlStrength'] as number | undefined;
    const inpaintStrength = nekoExtras['inpaintStrength'] as number | undefined;
    if (style) textPieces.push(`Style: ${style}`);
    if (editInstruction) textPieces.push(`Edit: ${editInstruction}`);
    if (negativePrompt) textPieces.push(`Avoid: ${negativePrompt}`);
    if (controlMode) {
      const strength = typeof controlStrength === 'number' ? ` (strength ${controlStrength})` : '';
      textPieces.push(`ControlNet: ${controlMode}${strength}`);
    }
    if (inpaintStrength !== undefined) {
      textPieces.push(`Inpaint strength: ${inpaintStrength} (white mask = repaint area)`);
    }

    // ── Image parts: each image carries an explicit role label so the model
    // can bind semantics (mask vs control vs reference vs IP-Adapter) rather
    // than relying on positional order.
    const parts: Array<Record<string, unknown>> = [];
    parts.push({ type: 'text', text: textPieces.join('\n') });

    const pushLabeledImage = (label: string, base64OrUrl: string, mimeHint = 'image/png'): void => {
      const url = base64OrUrl.startsWith('data:')
        ? base64OrUrl
        : base64OrUrl.startsWith('http')
          ? base64OrUrl
          : `data:${mimeHint};base64,${base64OrUrl}`;
      parts.push({ type: 'text', text: `[${label}]` });
      parts.push({ type: 'image_url', image_url: { url } });
    };

    const referenceImageBase64 = nekoExtras['referenceImageBase64'] as string | undefined;
    if (referenceImageBase64) pushLabeledImage('Reference image', referenceImageBase64);
    const referenceImageUrl = nekoExtras['referenceImageUrl'] as string | undefined;
    if (referenceImageUrl) pushLabeledImage('Reference image', referenceImageUrl);
    const controlImageBase64 = nekoExtras['controlImageBase64'] as string | undefined;
    if (controlImageBase64) {
      const label = controlMode
        ? `ControlNet conditioning (${controlMode})`
        : 'ControlNet conditioning';
      pushLabeledImage(label, controlImageBase64);
    }
    const maskBase64 = nekoExtras['maskBase64'] as string | undefined;
    if (maskBase64) pushLabeledImage('Inpaint mask (white = repaint)', maskBase64);
    const ipAdapterRefs = nekoExtras['ipAdapterRefs'] as
      | Array<{ imageBase64?: string; mimeType?: string; mode?: string }>
      | undefined;
    if (ipAdapterRefs) {
      ipAdapterRefs.forEach((ref, i) => {
        if (ref?.imageBase64) {
          const modeSuffix = ref.mode ? ` (${ref.mode})` : '';
          const indexSuffix = ipAdapterRefs.length > 1 ? ` ${i + 1}` : '';
          pushLabeledImage(
            `IP-Adapter${indexSuffix}${modeSuffix}`,
            ref.imageBase64,
            ref.mimeType ?? 'image/png',
          );
        }
      });
    }

    const userContent = parts.length > 1 ? parts : options.prompt;
    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: [{ role: 'user', content: userContent }],
      modalities: ['text', 'image'],
    };

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
      throw new Error(`Chat image generation failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;

    if (!data.choices?.length) {
      throw new Error('Chat image generation: no choices in response');
    }

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Chat image generation: empty response content');
    }

    // Extract images from response content
    const images = this.extractImages(content);

    if (images.length === 0) {
      throw new Error(
        `Chat image generation (${this.modelId}): no images in response. ` +
          `This path relies on the non-standard 'modalities: ["text","image"]' extension; ` +
          `your proxy may have stripped the modalities field or the selected model does ` +
          `not generate images in chat mode. ` +
          `Use NewAPIImageModel (/v1/images/generations) for spec-compliant text-to-image, ` +
          `or select a model with native chat-image support (Gemini 2.0+ native, GPT-image).`,
      );
    }

    return {
      images,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  /**
   * Extract base64 image strings from chat response content.
   * Handles multiple response formats from different proxies.
   */
  private extractImages(content: string | ContentPart[]): string[] {
    // String content — may contain markdown image or no image at all
    if (typeof content === 'string') {
      // Try to extract base64 from markdown: ![...](data:image/...;base64,...)
      const dataUrlMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g);
      if (dataUrlMatch) {
        return dataUrlMatch.map((url) => {
          // Extract just the base64 part after the comma
          const base64 = url.split(',')[1];
          return base64 ?? url;
        });
      }
      return [];
    }

    // Array content — extract from structured parts
    const images: string[] = [];

    for (const part of content) {
      // Format 1: { type: 'image_url', image_url: { url: 'data:image/...;base64,...' } }
      if (part.type === 'image_url') {
        const url = (part as ImageUrlPart).image_url?.url;
        if (url) {
          if (url.startsWith('data:')) {
            const base64 = url.split(',')[1];
            if (base64) images.push(base64);
          } else {
            // Direct URL — return as-is (AI SDK handles download)
            images.push(url);
          }
        }
      }

      // Format 2: { type: 'image', data: 'base64...' }
      if (part.type === 'image') {
        const imgPart = part as InlineImagePart;
        if (imgPart.data) {
          images.push(imgPart.data);
        }
        if (imgPart.source?.data) {
          images.push(imgPart.source.data);
        }
      }
    }

    return images;
  }

  private getBaseUrl(): string {
    let base = this.config.apiUrl.replace(/\/+$/, '');
    base = base.replace(/\/v1$/, '');
    return base;
  }
}
