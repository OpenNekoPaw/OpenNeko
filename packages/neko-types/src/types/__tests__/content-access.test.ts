import { describe, expect, it } from 'vitest';
import {
  isCacheOrRuntimeOnlyContentRef,
  isGeneratedCacheBackedSourceRef,
  isContentAccessRequest,
  isContentIngestRequest,
  isOfflineContentAccessIntent,
  isPreviewLikeContentAccessIntent,
  validateContentAccessRequest,
  validateContentIngestRequest,
  validateContentIngestResult,
  type ContentAccessRequest,
  type ContentIngestRequest,
} from '../content-access';
import { createResourceFingerprint, createResourceRef, type ResourceRef } from '../resource-cache';

describe('content access contracts', () => {
  const sourceResource = createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: {
      kind: 'file',
      filePath: '${MEDIA}/shot.png',
      projectRelativePath: 'media/shot.png',
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'shot-v1' }),
  });

  const extensionPrivateResource = createResourceRef({
    scope: 'extension-private',
    provider: 'agent',
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: 'scratch-image',
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'scratch-v1' }),
  });

  it('classifies preview-like and offline intents', () => {
    expect(isPreviewLikeContentAccessIntent('interactive-preview')).toBe(true);
    expect(isPreviewLikeContentAccessIntent('agent-context')).toBe(true);
    expect(isPreviewLikeContentAccessIntent('final-export')).toBe(false);
    expect(isOfflineContentAccessIntent('final-export')).toBe(true);
    expect(isOfflineContentAccessIntent('package')).toBe(true);
    expect(isOfflineContentAccessIntent('interactive-preview')).toBe(false);
  });

  it('parses access and ingest requests with stable refs', () => {
    const accessRequest: ContentAccessRequest = {
      ref: sourceResource,
      intent: 'interactive-preview',
      target: 'webview-uri',
      variant: { role: 'thumbnail', width: 256, height: 256 },
      caller: 'canvas',
    };
    const ingestRequest: ContentIngestRequest = {
      mode: 'generated-output',
      sourcePath: '/workspace/demo/neko/generated/image/shot.png',
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/generated/image',
      },
      mimeType: 'image/png',
      fileName: 'shot.png',
    };

    expect(isContentAccessRequest(accessRequest)).toBe(true);
    expect(isContentIngestRequest(ingestRequest)).toBe(true);
    expect(isContentAccessRequest({ ...accessRequest, intent: 'preview' })).toBe(false);
    expect(isContentIngestRequest({ ...ingestRequest, mode: 'write-file' })).toBe(false);
  });

  it('rejects runtime-only refs and derived roles for offline intents', () => {
    const runtimeRequest: ContentAccessRequest = {
      ref: {
        kind: 'runtime',
        runtimeKind: 'webview-uri',
        value: 'vscode-webview-resource://panel/image.png',
      },
      intent: 'package',
      target: 'local-path',
      role: 'thumbnail',
    };

    const diagnostics = validateContentAccessRequest(runtimeRequest);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'offline-runtime-ref',
      'offline-derived-role',
    ]);
  });

  it('rejects preview, proxy, Webview, blob, object, and runtime cache refs for offline intents', () => {
    const cases: Array<{
      readonly name: string;
      readonly request: ContentAccessRequest;
      readonly expectedCodes: readonly string[];
    }> = [
      {
        name: 'thumbnail role',
        request: {
          ref: sourceResource,
          intent: 'final-export',
          target: 'local-path',
          role: 'thumbnail',
        },
        expectedCodes: ['offline-derived-role'],
      },
      {
        name: 'preview role',
        request: {
          ref: sourceResource,
          intent: 'package',
          target: 'bytes',
          role: 'preview',
        },
        expectedCodes: ['offline-derived-role'],
      },
      {
        name: 'proxy role',
        request: {
          ref: sourceResource,
          intent: 'verify',
          target: 'bytes',
          role: 'proxy',
        },
        expectedCodes: ['offline-derived-role'],
      },
      {
        name: 'Webview URI',
        request: {
          ref: {
            kind: 'runtime',
            runtimeKind: 'webview-uri',
            value: 'vscode-webview-resource://panel/image.png',
          },
          intent: 'package',
          target: 'bytes',
        },
        expectedCodes: ['offline-runtime-ref'],
      },
      {
        name: 'blob URL',
        request: {
          ref: { kind: 'runtime', runtimeKind: 'blob-url', value: 'blob:vscode/preview' },
          intent: 'package',
          target: 'bytes',
        },
        expectedCodes: ['offline-runtime-ref'],
      },
      {
        name: 'object URL',
        request: {
          ref: { kind: 'runtime', runtimeKind: 'object-url', value: 'object:preview' },
          intent: 'package',
          target: 'bytes',
        },
        expectedCodes: ['offline-runtime-ref'],
      },
      {
        name: 'cache-only extension-private resource',
        request: {
          ref: extensionPrivateResource,
          intent: 'package',
          target: 'bytes',
        },
        expectedCodes: ['offline-runtime-ref'],
      },
      {
        name: 'runtime cache path',
        request: {
          ref: {
            kind: 'runtime',
            runtimeKind: 'cache-path',
            value: '/workspace/.neko/.cache/shot.png',
          },
          intent: 'package',
          target: 'bytes',
        },
        expectedCodes: ['offline-runtime-ref'],
      },
    ];

    for (const entry of cases) {
      expect(
        validateContentAccessRequest(entry.request).map((diagnostic) => diagnostic.code),
      ).toEqual(entry.expectedCodes);
    }
  });

  it('allows explicit draft-proxy export while still rejecting runtime targets', () => {
    const draftProxyRequest: ContentAccessRequest = {
      ref: sourceResource,
      intent: 'final-export',
      target: 'local-path',
      role: 'proxy',
      qualityMode: 'draft-proxy',
    };
    const runtimeTargetRequest: ContentAccessRequest = {
      ...draftProxyRequest,
      target: 'webview-uri',
    };

    expect(validateContentAccessRequest(draftProxyRequest)).toEqual([]);
    expect(
      validateContentAccessRequest(runtimeTargetRequest).map((diagnostic) => diagnostic.code),
    ).toEqual(['offline-runtime-target', 'webview-target-non-preview']);
  });

  it('treats extension-private and unpromoted generated refs as cache/runtime only', () => {
    expect(isCacheOrRuntimeOnlyContentRef(extensionPrivateResource)).toBe(true);
    expect(
      isCacheOrRuntimeOnlyContentRef({
        kind: 'generated-asset',
        assetId: 'agent-scratch',
        path: '/private/scratch.png',
      }),
    ).toBe(true);
    expect(
      isCacheOrRuntimeOnlyContentRef({
        kind: 'generated-asset',
        assetId: 'agent-promoted',
        path: '${PROJECT}/neko/generated/image/promoted.png',
        promoted: true,
      }),
    ).toBe(false);
    const cacheBackedPromotedRef = {
      kind: 'generated-asset' as const,
      assetId: 'agent-cache-backed',
      path: '.neko/.cache/generated/promoted.png',
      promoted: true,
    };
    expect(isGeneratedCacheBackedSourceRef(cacheBackedPromotedRef)).toBe(true);
    expect(isCacheOrRuntimeOnlyContentRef(cacheBackedPromotedRef)).toBe(true);
  });

  it('diagnoses cache-backed promoted generated refs for durable access', () => {
    const diagnostics = validateContentAccessRequest({
      ref: {
        kind: 'generated-asset',
        assetId: 'agent-cache-backed',
        path: '.neko/.cache/generated/promoted.png',
        promoted: true,
      },
      intent: 'package',
      target: 'local-path',
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'generated-cache-source-not-durable',
    );
  });

  it('flags durable ingest results that expose cache paths or uncontracted source paths', () => {
    const request: ContentIngestRequest = {
      mode: 'import-source',
      sourcePath: '/downloads/shot.png',
      destination: { kind: 'project', projectRoot: '/workspace/demo' },
      mimeType: 'image/png',
    };

    const diagnostics = validateContentIngestResult(
      {
        status: 'ready',
        request,
        outputPath: '/workspace/demo/.neko/.cache/resources/shot.png',
        source: sourceResource,
      },
      { projectRoot: '/workspace/demo' },
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'ingest-cache-output',
      'ingest-uncontracted-path',
    ]);
  });

  it('flags durable ingest results that expose scratch paths or runtime URLs as source identity', () => {
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      destination: { kind: 'generated-assets', projectRoot: '/workspace/demo' },
      mimeType: 'image/png',
    };

    expect(
      validateContentIngestResult({
        status: 'ready',
        request,
        outputPath: 'blob:vscode/preview',
        source: sourceResource,
      }).map((diagnostic) => diagnostic.code),
    ).toContain('ingest-runtime-output');
    expect(
      validateContentIngestResult(
        {
          status: 'ready',
          request,
          outputPath: '/agent/private/scratch/shot.png',
          contractedPath: '/agent/private/scratch/shot.png',
          source: sourceResource,
        },
        { extensionPrivateRoot: '/agent/private' },
      ).map((diagnostic) => diagnostic.code),
    ).toEqual(['ingest-cache-output', 'ingest-uncontracted-path']);
  });

  it('rejects promoted generated outputs in cache scope', () => {
    const request: ContentIngestRequest = {
      mode: 'generated-output',
      destination: { kind: 'generated-assets', projectRoot: '/workspace/demo' },
      mimeType: 'image/png',
    };

    expect(
      validateContentIngestResult(
        {
          status: 'ready',
          request,
          outputPath: '/workspace/demo/.neko/.cache/generated/agent-shot.png',
          contractedPath: '.neko/.cache/generated/agent-shot.png',
          source: {
            kind: 'generated-asset',
            assetId: 'agent-shot',
            path: '.neko/.cache/generated/agent-shot.png',
            promoted: true,
          },
        },
        { projectRoot: '/workspace/demo' },
      ).map((diagnostic) => diagnostic.code),
    ).toContain('ingest-cache-output');

    expect(
      validateContentIngestResult(
        {
          status: 'ready',
          request,
          outputPath: '/workspace/demo/.neko/.cache/resources/agent-shot.png',
          contractedPath: '.neko/.cache/resources/agent-shot.png',
          source: sourceResource,
        },
        { projectRoot: '/workspace/demo' },
      ).map((diagnostic) => diagnostic.code),
    ).toContain('ingest-cache-output');
  });

  it('rejects generated asset ingest destinations that are cache-backed or missing durable roots', () => {
    const cacheDestinationRequest: ContentIngestRequest = {
      mode: 'generated-output',
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/.neko/.cache/generated',
      },
      mimeType: 'image/png',
    };
    const missingRootRequest: ContentIngestRequest = {
      mode: 'generated-output',
      destination: { kind: 'generated-assets' },
      mimeType: 'image/png',
    };
    const durableRootRequest: ContentIngestRequest = {
      mode: 'generated-output',
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/neko/generated/image',
      },
      mimeType: 'image/png',
    };

    expect(
      validateContentIngestRequest(cacheDestinationRequest, {
        projectRoot: '/workspace/demo',
      }).map((diagnostic) => diagnostic.code),
    ).toEqual(['generated-assets-destination-cache']);
    expect(
      validateContentIngestRequest(missingRootRequest).map((diagnostic) => diagnostic.code),
    ).toEqual(['generated-assets-destination-missing-root']);
    expect(validateContentIngestRequest(durableRootRequest)).toEqual([]);
  });

  it('accepts contracted durable ingest results and export staging outputs', () => {
    const importRequest: ContentIngestRequest = {
      mode: 'register-existing-source',
      sourcePath: '/Volumes/media/shot.png',
      destination: { kind: 'media-library', mediaLibraryId: 'main' },
    };
    const stageRequest: ContentIngestRequest = {
      mode: 'stage-export',
      destination: { kind: 'export-output', allowAbsolutePath: true },
      fileName: 'final.mp4',
    };

    expect(
      validateContentIngestResult({
        status: 'ready',
        request: importRequest,
        outputPath: '/Volumes/media/shot.png',
        contractedPath: '${MEDIA}/shot.png',
        source: sourceResource,
      }),
    ).toEqual([]);
    expect(
      validateContentIngestResult({
        status: 'ready',
        request: stageRequest,
        outputPath: '/exports/final.mp4',
        stagedOutput: { path: '/exports/final.mp4', kind: 'export' },
      }),
    ).toEqual([]);
  });

  it('serializes stable resource refs without cachePath', () => {
    const json = JSON.stringify({
      ref: sourceResource satisfies ResourceRef,
      role: 'thumbnail',
    });

    expect(json).toContain('${MEDIA}/shot.png');
    expect(json).not.toContain('cachePath');
    expect(json).not.toContain('vscode-webview-resource');
  });
});
