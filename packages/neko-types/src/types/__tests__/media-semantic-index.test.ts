import { describe, expect, it } from 'vitest';
import {
  createMediaSemanticIndexSidecarRecord,
  parseMediaSemanticIndexSidecar,
  mapMediaTextSourceKindToCharacterObservationSource,
  mediaTextSegmentToCharacterObservationProvenance,
  projectPerceptionCardToMediaSemanticIndex,
  serializeMediaSemanticIndexSidecar,
  validateMediaSemanticIndexSidecarRecord,
  validateEntityMemoryContribution,
  validateMediaSemanticIndex,
  validateMediaTextSegment,
  type EntityMemoryContribution,
  type MediaSemanticIndex,
  type MediaTextSegment,
} from '../media-semantic-index';
import type { PerceptionCard } from '../perception-card';

describe('media semantic index contracts', () => {
  it('validates searchable media evidence with stable refs', () => {
    const index = makeIndex();

    expect(validateMediaSemanticIndex(index)).toEqual({ ok: true, diagnostics: [] });
  });

  it('maps media text source kinds to character observation sources', () => {
    const segment = makeSegment();

    expect(mapMediaTextSourceKindToCharacterObservationSource('comic')).toBe('comic');
    expect(mediaTextSegmentToCharacterObservationProvenance(segment)).toEqual({
      source: 'comic',
      providerId: 'ocr.local',
      toolCallId: 'tool-1',
    });
  });

  it('rejects unsafe runtime handles and invalid source kinds', () => {
    const result = validateMediaTextSegment({
      ...makeSegment(),
      provenance: {
        providerId: 'ocr.local',
        sourceKind: 'screenshot',
      },
      metadata: {
        uri: 'vscode-resource://panel.png',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['invalid-source-kind', 'unsafe-runtime-handle']),
    );
  });

  it('validates bounding boxes and range-source compatibility', () => {
    const result = validateMediaTextSegment({
      ...makeSegment(),
      sourceRef: {
        kind: 'story',
        storyId: 'story-1',
      },
      range: {
        startLine: 1,
        endLine: 2,
        boundingBox: {
          x: '0',
          y: 0,
          width: -1,
          height: 10,
          unit: 'ratio',
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['invalid-bounding-box', 'invalid-range']),
    );
  });

  it('diagnoses irrelevant range fields for timeline evidence', () => {
    const result = validateMediaTextSegment({
      ...makeSegment(),
      sourceRef: {
        kind: 'cut-range',
        timelineId: 'timeline-1',
        startMs: 100,
        endMs: 900,
      },
      range: {
        pageId: 'page-1',
        panelId: 'panel-1',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-range', path: ['range', 'pageId'] }),
      expect.objectContaining({ code: 'invalid-range', path: ['range', 'panelId'] }),
    ]);
  });

  it('validates contribution review policy without confirming facts', () => {
    const contribution = makeContribution();
    const invalid = validateEntityMemoryContribution({
      ...contribution,
      reviewPolicy: 'accepted',
    });

    expect(validateEntityMemoryContribution(contribution)).toEqual({ ok: true, diagnostics: [] });
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-review-policy',
        path: ['reviewPolicy'],
      }),
    ]);
  });

  it('projects perception cards into refs and searchable text segments without embedding full cards', () => {
    const card: PerceptionCard = {
      version: 1,
      assetId: 'asset-page-1',
      modality: 'image',
      sourceToolCallId: 'tool-1',
      contextPacketId: 'packet-1',
      createdAt: 1_800_000_000,
      cacheKey: 'perception-v1',
      layerStatus: {
        layer0: 'complete',
        layer1: 'complete',
        layer2: 'skipped',
      },
      structural: {
        format: 'png',
        mimeType: 'image/png',
        byteSize: 1024,
      },
      semantic: {
        evidences: [
          {
            kind: 'description',
            confidence: 0.72,
            value: 'A panel with Rin speaking.',
          },
          {
            kind: 'loudness',
            confidence: 0.5,
            value: { peak: -8 },
          },
        ],
      },
    };

    const index = projectPerceptionCardToMediaSemanticIndex({
      card,
      sourceRef: {
        kind: 'generated-asset',
        assetId: 'asset-page-1',
        path: '${WORKSPACE}/generated/page-1.png',
      },
    });

    expect(index.perceptionRefs).toEqual([
      {
        assetId: 'asset-page-1',
        cacheKey: 'perception-v1',
        sourceToolCallId: 'tool-1',
        contextPacketId: 'packet-1',
        createdAt: 1_800_000_000,
      },
    ]);
    expect(index.textSegments).toEqual([
      expect.objectContaining({
        kind: 'caption',
        text: 'A panel with Rin speaking.',
      }),
    ]);
    expect(JSON.stringify(index)).not.toContain('layerStatus');
    expect(validateMediaSemanticIndex(index)).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects oversized inline payloads', () => {
    const result = validateMediaSemanticIndex(
      {
        ...makeIndex(),
        metadata: {
          inlineImage: `data:image/png;base64,${'a'.repeat(128)}`,
        },
      },
      { maxSerializedBytes: 64 },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['unsafe-runtime-handle', 'oversized-payload']),
    );
  });

  it('serializes semantic sidecars as SSOT records separate from cache projections', () => {
    const record = {
      ...createMediaSemanticIndexSidecarRecord(makeIndex()),
      searchItemsCachePath:
        '${PROJECT}/.neko/.cache/project-search/semantic-evidence.json' as const,
    };
    const serialized = serializeMediaSemanticIndexSidecar(record);
    const parsed = parseMediaSemanticIndexSidecar(serialized.content ?? '');

    expect(validateMediaSemanticIndexSidecarRecord(record)).toEqual({ ok: true, diagnostics: [] });
    expect(record.ref).toMatchObject({
      rootDir: '${PROJECT}/.neko/semantic-index',
      relativePath: 'asset-page-1/index-page-1.json',
      assetId: 'asset-page-1',
    });
    expect(serialized.ok).toBe(true);
    expect(serialized.content).toContain('"assetId": "asset-page-1"');
    expect(parsed.record?.index.assetId).toBe('asset-page-1');
  });

  it('diagnoses unsafe semantic sidecar refs and cache paths', () => {
    const record = createMediaSemanticIndexSidecarRecord(makeIndex());
    const result = validateMediaSemanticIndexSidecarRecord({
      ...record,
      ref: {
        ...record.ref,
        assetId: 'different-asset',
        relativePath: '../escape.json',
      },
      searchItemsCachePath: '${PROJECT}/.neko/semantic-index/cache.json' as never,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['invalid-source-ref']),
    );
  });
});

function makeIndex(): MediaSemanticIndex {
  return {
    version: 1,
    indexId: 'index-page-1',
    assetId: 'asset-page-1',
    sourceRef: {
      kind: 'asset',
      assetId: 'asset-page-1',
      sourcePath: '${WORKSPACE}/comic/page-1.png',
    },
    textSegments: [makeSegment()],
    perceptionRefs: [
      {
        assetId: 'asset-page-1',
        cacheKey: 'perception-v1',
        sourceToolCallId: 'tool-1',
      },
    ],
    semanticTags: [
      {
        tagId: 'tag-dialogue',
        label: 'dialogue',
        source: 'comic',
        confidence: 0.8,
      },
    ],
  };
}

function makeSegment(): MediaTextSegment {
  return {
    segmentId: 'segment-panel-1',
    kind: 'ocr',
    text: 'Rin: We have to go.',
    sourceRef: {
      kind: 'tool-result',
      toolCallId: 'tool-1',
      assetIndex: 0,
      range: {
        pageId: 'page-1',
        panelId: 'panel-1',
      },
    },
    range: {
      pageId: 'page-1',
      panelId: 'panel-1',
      boundingBox: {
        x: 10,
        y: 20,
        width: 120,
        height: 48,
        unit: 'pixel',
      },
    },
    confidence: 0.82,
    provenance: {
      providerId: 'ocr.local',
      sourceKind: 'comic',
      toolCallId: 'tool-1',
    },
  };
}

function makeContribution(): EntityMemoryContribution {
  return {
    contributionId: 'contribution-comic-page-1',
    sourcePackage: 'neko-agent',
    sourceRef: {
      kind: 'tool-result',
      toolCallId: 'tool-1',
    },
    reviewPolicy: 'source-approved',
    mediaTextSegments: [makeSegment()],
    diagnostics: [
      {
        severity: 'info',
        code: 'ocr-complete',
        message: 'OCR text extracted from page 1.',
      },
    ],
  };
}
