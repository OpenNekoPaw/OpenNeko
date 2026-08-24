import { describe, expect, it } from 'vitest';
import { IMAGE_OPERATION_IDS } from '@neko/generation';
import {
  AUDITED_IMAGE_CAPABILITY_MATRIX,
  getProviderVideoOperationSupport,
  resolveCanonicalVideoOperation,
  validateProviderImageRequest,
  validateProviderVideoRequest,
} from '../media-operation-capabilities';
import type { ImageGenerationRequest, VideoGenerationRequest } from '@neko/generation';

function contentLocator(id: string) {
  return {
    file: { authority: 'workspace' as const, path: `assets/${id.replaceAll(':', '-')}` },
  };
}

function videoRequest(overrides: Partial<VideoGenerationRequest> = {}): VideoGenerationRequest {
  return { prompt: 'cinematic movement', ...overrides };
}

function errorCodes(request: VideoGenerationRequest, provider: 'runway' | 'dashscope' | 'openai') {
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

  it('accepts audited DashScope first/end-frame controls', () => {
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
        'dashscope',
      ),
    ).toEqual([]);
  });

  it('does not infer transform, extend, or enhance support from a prompt', () => {
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
    expect(
      errorCodes(
        videoRequest({
          operation: 'extend',
          inputs: [{ type: 'video', role: 'reference-video', locator: source }],
        }),
        'openai',
      ),
    ).toContain('operation-unsupported');
    expect(
      errorCodes(
        videoRequest({
          operation: 'enhance',
          inputs: [{ type: 'video', role: 'reference-video', locator: source }],
        }),
        'openai',
      ),
    ).toContain('operation-unsupported');
  });

  it('accepts declared controls for audited OpenAI-compatible operations', () => {
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
        'openai',
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

  it('routes non-provider image operations to owning adapters instead of substitutions', () => {
    const request: ImageGenerationRequest = {
      prompt: 'extend the canvas',
      operation: 'outpaint',
      referenceImageLocator: contentLocator('source:image'),
      outpaintExpansion: { left: 64, right: 64, top: 0, bottom: 128, fillMode: 'generative' },
    };
    expect(validateProviderImageRequest('openai', request)).toEqual([
      expect.objectContaining({ code: 'operation-unsupported', severity: 'error' }),
    ]);
  });

  it('requires both audited adapter mapping and precise selected-model capabilities', () => {
    const request: ImageGenerationRequest = {
      prompt: 'match the pose',
      controlImageLocator: contentLocator('preview:pose'),
      controlMode: 'pose',
    };

    expect(validateProviderImageRequest('dashscope', request, ['image.control.pose'])).toEqual([]);
    expect(validateProviderImageRequest('dashscope', request, ['controlnet'])).toEqual([
      expect.objectContaining({
        code: 'unsupported-operation-control',
        details: expect.objectContaining({ owner: 'model' }),
      }),
    ]);
    expect(validateProviderImageRequest('runway', request, ['image.control.pose'])).toEqual([
      expect.objectContaining({
        code: 'unsupported-operation-control',
        details: expect.objectContaining({ owner: 'adapter' }),
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
        details: expect.objectContaining({ owner: 'adapter' }),
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
        details: expect.objectContaining({ owner: 'adapter' }),
      }),
    ]);
    expect(
      validateProviderImageRequest('oneapi', request, ['text_to_image', 'image.control.pose']),
    ).toEqual([]);
  });

  it('fails structured camera and panorama references while no adapter owns them', () => {
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
      expect.objectContaining({ details: expect.objectContaining({ owner: 'adapter' }) }),
      expect.objectContaining({ details: expect.objectContaining({ owner: 'adapter' }) }),
    ]);
  });

  it('accepts one audited stable appearance reference and rejects silent truncation', () => {
    const appearance = (id: string) => ({
      imageLocator: contentLocator(id),
      mode: 'subject' as const,
    });
    expect(
      validateProviderImageRequest(
        'fal',
        { prompt: 'same character', ipAdapterRefs: [appearance('appearance:1')] },
        ['image.reference.ip-adapter'],
      ),
    ).toEqual([]);
    expect(
      validateProviderImageRequest(
        'fal',
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

  it('audits every canonical image operation as supported, degraded, or unsupported', () => {
    const auditedIds = new Set(AUDITED_IMAGE_CAPABILITY_MATRIX.map((entry) => entry.operationId));
    expect(IMAGE_OPERATION_IDS.filter((operationId) => !auditedIds.has(operationId))).toEqual([]);
    expect(AUDITED_IMAGE_CAPABILITY_MATRIX).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationId: 'outpaint', level: 'unsupported' }),
        expect.objectContaining({ operationId: 'split', level: 'unsupported' }),
        expect.objectContaining({ operationId: 'background-remove', level: 'degraded' }),
      ]),
    );
  });

  it('declares unsupported operations with no accepted controls', () => {
    expect(getProviderVideoOperationSupport('runway', 'extend')).toEqual(
      expect.objectContaining({ level: 'unsupported', acceptedControls: [] }),
    );
  });
});
