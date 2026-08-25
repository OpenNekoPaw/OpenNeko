import { describe, expect, it } from 'vitest';
import {
  mapMediaTextSourceKindToCharacterObservationSource,
  mediaTextSegmentToCharacterObservationProvenance,
  validateEntityMemoryContribution,
  validateMediaSemanticIndex,
  validateMediaTextSegment,
  type EntityMemoryContribution,
  type MediaSemanticIndex,
  type MediaTextSegment,
} from '../media-semantic-index';

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
        uri: 'neko-media://panel.png',
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
});

function makeIndex(): MediaSemanticIndex {
  return {
    indexId: 'index-page-1',
    assetId: 'asset-page-1',
    sourceRef: {
      kind: 'asset',
      assetId: 'asset-page-1',
      sourcePath: '${WORKSPACE}/comic/page-1.png',
    },
    textSegments: [makeSegment()],
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
