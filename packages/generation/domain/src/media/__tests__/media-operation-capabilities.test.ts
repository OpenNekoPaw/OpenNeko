import { describe, expect, it } from 'vitest';
import {
  getProviderVideoOperationSupport,
  resolveCanonicalVideoOperation,
  validateProviderImageRequest,
  validateProviderVideoRequest,
} from '../media-operation-capabilities';
import type { ImageGenerationRequest, VideoGenerationRequest } from '@neko/generation-domain';

function contentLocator(id: string) {
  return {
    file: { authority: 'workspace' as const, path: `assets/${id.replaceAll(':', '-')}` },
  };
}

function videoRequest(overrides: Partial<VideoGenerationRequest> = {}): VideoGenerationRequest {
  return { prompt: 'cinematic movement', ...overrides };
}

function errorCodes(
  request: VideoGenerationRequest,
  provider: 'runway' | 'bytedance' | 'minimax' | 'openai',
) {
  return validateProviderVideoRequest(provider, request)
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => diagnostic.code);
}

describe('media provider capability negotiation', () => {
  it('rejects Runway end-frame requests before submission', () => {
    expect(
      errorCodes(
        videoRequest({
          operation: 'generate-from-keyframes',
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: contentLocator('asset:image:first.png'),
            },
            { type: 'image', role: 'last-frame', locator: contentLocator('asset:image:last.png') },
          ],
        }),
        'runway',
      ),
    ).toEqual(expect.arrayContaining(['operation-unsupported', 'unsupported-operation-control']));
  });

  it('accepts audited ByteDance first/end-frame controls', () => {
    expect(
      errorCodes(
        videoRequest({
          operation: 'generate-from-keyframes',
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: contentLocator('asset:image:first.png'),
            },
            { type: 'image', role: 'last-frame', locator: contentLocator('asset:image:last.png') },
          ],
          cameraMovement: 'dolly-in',
          duration: 5,
          aspectRatio: '16:9',
        }),
        'bytedance',
      ),
    ).toEqual([]);
  });

  it('does not infer transform support for providers without an AI SDK video runtime', () => {
    const source = contentLocator('asset:video:source.mp4');
    expect(
      errorCodes(
        videoRequest({
          operation: 'transform',
          inputs: [{ type: 'video', role: 'reference-video', locator: source }],
          editInstruction: 'turn this into watercolor',
        }),
        'runway',
      ),
    ).toContain('operation-unsupported');
  });

  it('accepts declared controls for the audited MiniMax AI SDK model', () => {
    expect(
      errorCodes(
        videoRequest({
          operation: 'generate-from-keyframes',
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: contentLocator('asset:image:first.png'),
            },
            { type: 'image', role: 'last-frame', locator: contentLocator('asset:image:last.png') },
          ],
          motionStrength: 0.5,
          cameraMovement: 'pan-left',
          cameraAngle: 'low-angle',
          shotScale: 'medium-shot',
          duration: 6,
          aspectRatio: '16:9',
          resolution: '1920x1080',
        }),
        'minimax',
      ),
    ).toEqual([]);
  });

  it('uses stable locators when resolving canonical video operations', () => {
    expect(
      resolveCanonicalVideoOperation(
        videoRequest({
          inputs: [
            {
              type: 'image',
              role: 'first-frame',
              locator: contentLocator('asset:image:first.png'),
            },
            { type: 'image', role: 'last-frame', locator: contentLocator('asset:image:last.png') },
          ],
        }),
      ),
    ).toBe('generate-from-keyframes');
    expect(
      resolveCanonicalVideoOperation(
        videoRequest({
          inputs: [
            {
              type: 'video',
              role: 'reference-video',
              locator: contentLocator('asset:video:source.mp4'),
            },
          ],
        }),
      ),
    ).toBe('restyle');
  });

  it('requires exact source and mask inputs for provider image editing', () => {
    expect(validateProviderImageRequest('openai', { prompt: 'edit', operation: 'edit' })).toEqual([
      expect.objectContaining({ code: 'missing-required-input', severity: 'error' }),
    ]);
    expect(
      validateProviderImageRequest('openai', {
        prompt: 'replace the sky',
        operation: 'inpaint',
        referenceImageLocator: contentLocator('source:image'),
      }),
    ).toEqual([
      expect.objectContaining({
        code: 'missing-required-input',
        details: expect.objectContaining({ role: 'mask' }),
      }),
    ]);
  });

  it('rejects image editing when the provider or selected model has no edit path', () => {
    const request: ImageGenerationRequest = {
      prompt: 'replace the sky',
      operation: 'edit',
      referenceImageLocator: contentLocator('source:image'),
    };

    expect(validateProviderImageRequest('openai', request, ['text_to_image'])).toEqual([
      expect.objectContaining({
        code: 'operation-unsupported',
        details: expect.objectContaining({ owner: 'model' }),
      }),
    ]);
    expect(validateProviderImageRequest('runway', request, ['image.edit'])).toEqual([
      expect.objectContaining({
        code: 'operation-unsupported',
        details: expect.objectContaining({ owner: 'provider' }),
      }),
    ]);
  });

  it('requires a reference video and an edit-capable model for video editing', () => {
    const request = videoRequest({ operation: 'transform', editInstruction: 'make it blue' });

    expect(validateProviderVideoRequest('minimax', request, ['video.generate'])).toEqual([
      expect.objectContaining({ code: 'missing-required-input' }),
      expect.objectContaining({
        code: 'operation-unsupported',
        details: expect.objectContaining({ owner: 'model' }),
      }),
    ]);
  });

  it('requires both audited provider mapping and precise selected-model capabilities', () => {
    const request: ImageGenerationRequest = {
      prompt: 'match the pose',
      controlImageLocator: contentLocator('preview:pose'),
      controlMode: 'pose',
    };

    expect(validateProviderImageRequest('oneapi', request, ['image.control.pose'])).toEqual([]);
    expect(validateProviderImageRequest('oneapi', request, ['controlnet'])).toEqual([
      expect.objectContaining({
        code: 'unsupported-operation-control',
        details: expect.objectContaining({ owner: 'model' }),
      }),
    ]);
    expect(validateProviderImageRequest('runway', request, ['image.control.pose'])).toEqual([
      expect.objectContaining({
        code: 'unsupported-operation-control',
        details: expect.objectContaining({ owner: 'provider' }),
      }),
    ]);
  });

  it('rejects runtimes that ignore or prompt-project precise controls', () => {
    const request: ImageGenerationRequest = {
      prompt: 'match the pose',
      controlImageLocator: contentLocator('preview:pose'),
      controlMode: 'pose',
    };

    expect(validateProviderImageRequest('openai', request, ['image.control.pose'])).toEqual([
      expect.objectContaining({
        code: 'unsupported-operation-control',
        details: expect.objectContaining({ owner: 'provider' }),
      }),
    ]);
    expect(
      validateProviderImageRequest('newapi', request, [
        'chat',
        'text_to_image',
        'image.control.pose',
      ]),
    ).toEqual([
      expect.objectContaining({
        code: 'unsupported-operation-control',
        details: expect.objectContaining({ owner: 'provider' }),
      }),
    ]);
    expect(
      validateProviderImageRequest('oneapi', request, ['text_to_image', 'image.control.pose']),
    ).toEqual([]);
  });

  it('fails structured camera and panorama references while no provider owns them', () => {
    const request: ImageGenerationRequest = {
      prompt: 'match the composition',
      cameraReference: {
        value: {
          cameraId: 'front',
          position: { x: 0, y: 1, z: 3 },
          target: { x: 0, y: 1, z: 0 },
          fieldOfViewDeg: 45,
          aspectRatio: 1,
        },
        identity: { sessionId: 'camera-session', requestId: 'camera-request' },
      },
      panoramaReference: {
        imageLocator: contentLocator('preview:panorama'),
        orientation: { yawDeg: 0, pitchDeg: 0, fieldOfViewDeg: 70 },
        identity: { sessionId: 'panorama-session', requestId: 'panorama-request' },
      },
    };

    const diagnostics = validateProviderImageRequest('fal', request, [
      'image.control.camera',
      'image.control.panorama',
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ details: expect.objectContaining({ owner: 'provider' }) }),
      expect.objectContaining({ details: expect.objectContaining({ owner: 'provider' }) }),
    ]);
  });

  it('accepts one audited stable appearance reference and rejects silent truncation', () => {
    const appearance = (id: string) => ({
      imageLocator: contentLocator(id),
      mode: 'subject' as const,
    });
    expect(
      validateProviderImageRequest(
        'oneapi',
        { prompt: 'same character', ipAdapterRefs: [appearance('appearance:1')] },
        ['image.reference.ip-adapter'],
      ),
    ).toEqual([]);
    expect(
      validateProviderImageRequest(
        'oneapi',
        {
          prompt: 'ambiguous character',
          ipAdapterRefs: [appearance('appearance:1'), appearance('appearance:2')],
        },
        ['image.reference.ip-adapter'],
      ),
    ).toEqual([expect.objectContaining({ code: 'operation-limit-exceeded', severity: 'error' })]);
  });

  it('rejects control inputs without an exact role before execution', () => {
    expect(
      validateProviderImageRequest(
        'dashscope',
        { prompt: 'missing role', controlImageLocator: contentLocator('preview:control') },
        ['image.control.pose'],
      ),
    ).toEqual([
      expect.objectContaining({
        code: 'unsupported-operation-control',
        details: expect.objectContaining({ owner: 'request' }),
      }),
    ]);
  });

  it('declares unsupported operations with no accepted controls', () => {
    expect(getProviderVideoOperationSupport('runway', 'transform')).toEqual(
      expect.objectContaining({ level: 'unsupported', acceptedControls: [] }),
    );
  });
});
