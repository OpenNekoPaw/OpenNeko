import { describe, expect, it, vi } from 'vitest';
import type { ResourceRef } from '../resource-cache';
import {
  ImageOperationCapabilityRegistry,
  VideoOperationCapabilityRegistry,
  type CreativeMediaOperationAdapter,
  type CreativeMediaOperationRequest,
  type CreativeMediaOperationResult,
  type CreativeMediaOperationSupport,
} from '../index';

function resourceRef(id = 'asset:image:hero'): ResourceRef {
  return {
    id,
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: `assets/${id.replaceAll(':', '-')}.png` },
    fingerprint: { strategy: 'hash', value: `sha256:${id}` },
  };
}

function support(
  overrides: Partial<CreativeMediaOperationSupport> = {},
): CreativeMediaOperationSupport {
  return {
    version: 1,
    mediaKind: 'image',
    operationId: 'generate',
    level: 'supported',
    adapterId: 'media-provider',
    acceptedControls: ['prompt'],
    diagnostics: [],
    ...overrides,
  };
}

function request(
  overrides: Partial<CreativeMediaOperationRequest> = {},
): CreativeMediaOperationRequest {
  return {
    version: 1,
    requestId: 'request-1',
    mediaKind: 'image',
    operationId: 'generate',
    inputRefs: [],
    prompt: 'hero portrait',
    ...overrides,
  };
}

function successResult(
  operationRequest: CreativeMediaOperationRequest,
): CreativeMediaOperationResult {
  return {
    version: 1,
    requestId: operationRequest.requestId,
    mediaKind: operationRequest.mediaKind,
    operationId: operationRequest.operationId,
    status: 'succeeded',
    outputRefs: [resourceRef('asset:image:output')],
    diagnostics: [],
  };
}

function adapter(
  declaration: CreativeMediaOperationSupport,
  execute: CreativeMediaOperationAdapter['execute'] = async (operationRequest) =>
    successResult(operationRequest),
): CreativeMediaOperationAdapter {
  return { support: declaration, execute };
}

describe('creative media capability registry', () => {
  it('keeps image and video adapters isolated without feature-package imports', () => {
    const imageRegistry = new ImageOperationCapabilityRegistry();
    const videoRegistry = new VideoOperationCapabilityRegistry();

    imageRegistry.register(adapter(support()));
    expect(() => videoRegistry.register(adapter(support()))).toThrow(/belongs to image, not video/);
    expect(videoRegistry.list()).toEqual([]);
  });

  it('rejects duplicate adapter-operation registrations', () => {
    const registry = new ImageOperationCapabilityRegistry();
    const registered = adapter(support());
    registry.register(registered);

    expect(() => registry.register(registered)).toThrow(/already registered/);
  });

  it('selects supported behavior before degraded behavior and preserves warnings', () => {
    const registry = new ImageOperationCapabilityRegistry();
    registry.register(
      adapter(
        support({
          adapterId: 'degraded-adapter',
          level: 'degraded',
          degradedControls: ['prompt'],
          diagnostics: [
            {
              code: 'operation-degraded',
              severity: 'warning',
              message: 'Prompt interpretation is approximate.',
            },
          ],
        }),
      ),
    );
    registry.register(adapter(support({ adapterId: 'supported-adapter' })));

    expect(registry.negotiate(request()).support?.adapterId).toBe('supported-adapter');
    const degraded = registry.negotiate(request(), 'degraded-adapter');
    expect(degraded.ok).toBe(true);
    expect(degraded.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'operation-degraded' })]),
    );
  });

  it('fails before dispatch when an end frame would be silently dropped', async () => {
    const registry = new VideoOperationCapabilityRegistry();
    const execute = vi.fn();
    registry.register(
      adapter(
        support({
          mediaKind: 'video',
          operationId: 'generate-from-keyframes',
          adapterId: 'start-frame-only-provider',
          acceptedControls: ['prompt', 'start-frame'],
        }),
        execute,
      ),
    );

    const result = await registry.dispatch(
      request({
        mediaKind: 'video',
        operationId: 'generate-from-keyframes',
        inputRefs: [],
        startFrameRef: resourceRef('asset:image:first'),
        endFrameRef: resourceRef('asset:image:last'),
      }),
    );

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unsupported-operation-control' })]),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires explicit outpaint expansion and exact split profile support', () => {
    const outpaintRegistry = new ImageOperationCapabilityRegistry();
    outpaintRegistry.register(
      adapter(
        support({
          operationId: 'outpaint',
          adapterId: 'outpaint-adapter',
          acceptedControls: ['outpaint-expansion'],
        }),
      ),
    );
    expect(
      outpaintRegistry.negotiate(request({ operationId: 'outpaint', inputRefs: [resourceRef()] }))
        .diagnostics,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-required-input' })]),
    );

    const splitRegistry = new ImageOperationCapabilityRegistry();
    splitRegistry.register(
      adapter(
        support({
          operationId: 'split',
          adapterId: 'grid-split-adapter',
          acceptedControls: ['split-profile'],
          supportedSplitProfiles: ['grid-crop'],
        }),
      ),
    );
    const negotiation = splitRegistry.negotiate(
      request({
        operationId: 'split',
        inputRefs: [resourceRef()],
        splitProfile: 'comic-panel',
        splitOptions: { profileId: 'comic-panel' },
      }),
    );
    expect(negotiation.ok).toBe(false);
    expect(negotiation.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unsupported-split-profile' })]),
    );
  });

  it('only accepts adapter extensions declared by the selected adapter', () => {
    const registry = new ImageOperationCapabilityRegistry();
    registry.register(
      adapter(
        support({
          adapterId: 'provider-adapter',
          extensionFields: ['seed'],
        }),
      ),
    );

    expect(
      registry.negotiate(
        request({
          adapterExtensions: {
            adapterId: 'provider-adapter',
            values: { undocumentedMode: true },
          },
        }),
      ).diagnostics,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'adapter-extension-unsupported' })]),
    );
    expect(
      registry.negotiate(
        request({
          adapterExtensions: { adapterId: 'provider-adapter', values: { seed: 42 } },
        }),
      ).ok,
    ).toBe(true);
  });

  it('rejects adapter results bound to another request or operation', async () => {
    const registry = new ImageOperationCapabilityRegistry();
    registry.register(
      adapter(support(), async (operationRequest) => ({
        ...successResult(operationRequest),
        requestId: 'another-request',
        operationId: 'edit',
      })),
    );

    const result = await registry.dispatch(request());

    expect(result).toMatchObject({
      requestId: 'request-1',
      mediaKind: 'image',
      operationId: 'generate',
      status: 'failed',
      outputRefs: [],
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid-operation-result' })]),
    );
  });

  it('converts malformed successful adapter results into explicit failures', async () => {
    const registry = new ImageOperationCapabilityRegistry();
    registry.register(
      adapter(support(), async (operationRequest) => ({
        ...successResult(operationRequest),
        outputRefs: [],
      })),
    );

    const result = await registry.dispatch(request());
    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'invalid-operation-result' })]),
    );
  });
});
