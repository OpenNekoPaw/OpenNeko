import { describe, expect, it } from 'vitest';
import {
  isCanvasMarkdownCapabilityInput,
  isCanvasMarkdownCapabilityResult,
  isCanvasMarkdownContentBinding,
  isRuntimeOnlyCanvasMarkdownResourceValue,
  validateCanvasMarkdownCapabilityInput,
  type CanvasMarkdownCapabilityInput,
  type CanvasMarkdownCapabilityResult,
} from './canvas-markdown-capabilities';

describe('canonical Canvas Markdown capability contracts', () => {
  it.each(['canvas.ingestMarkdown', 'canvas.createMarkdownNote'] as const)(
    'accepts %s as one Markdown-node authoring input',
    (capabilityId) => {
      const input: CanvasMarkdownCapabilityInput = {
        capabilityId,
        markdown: '# Plan\n\n| source | note |\n| --- | --- |\n| P1 | Keep as Markdown |',
        title: 'Plan',
        sourceFormat: 'gfm-table',
        target: {
          containerId: 'group-1',
          insertionPoint: { x: 100, y: 120 },
          mode: 'insert',
        },
        provenance: { source: 'agent', conversationId: 'conversation-1' },
      };

      expect(validateCanvasMarkdownCapabilityInput(input)).toEqual([]);
      expect(isCanvasMarkdownCapabilityInput(input)).toBe(true);
    },
  );

  it('diagnoses invalid Markdown, source format, target, and provenance', () => {
    const diagnostics = validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.createMarkdownNote',
      markdown: '   ',
      sourceFormat: 'html',
      target: { insertionPoint: { x: Number.NaN, y: 0 } },
      provenance: { source: 'unknown' },
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-markdown-missing-markdown',
      'canvas-markdown-unsupported-source-format',
      'canvas-markdown-invalid-target',
      'canvas-markdown-invalid-provenance',
    ]);
  });

  it('keeps stable resource context separate from Markdown capability input', () => {
    const contentLocator = createTestContentLocator();
    expect(
      isCanvasMarkdownContentBinding({
        token: 'cover',
        sourcePath: 'assets/cover.png',
        contentLocator,
      }),
    ).toBe(true);
    expect(isCanvasMarkdownContentBinding({ token: 'cover' })).toBe(false);
  });

  it('classifies runtime-only resource values', () => {
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('neko-media://panel/image.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('blob:neko-media/preview')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('/tmp/neko/page.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('/var/folders/neko/page.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('/workspace/.cache/page.png')).toBe(true);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('assets/cover.png')).toBe(false);
    expect(isRuntimeOnlyCanvasMarkdownResourceValue('${MEDIA}/cover.png')).toBe(false);
  });

  it('accepts only canonical Markdown capability results', () => {
    const result: CanvasMarkdownCapabilityResult = {
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'markdown-note',
      nodeIds: ['markdown-1'],
      diagnostics: [],
      preview: {
        title: 'Plan',
        rowCount: 3,
        resolvedKind: 'markdown-note',
      },
    };

    expect(isCanvasMarkdownCapabilityResult(result)).toBe(true);
    expect(isCanvasMarkdownCapabilityResult({ ...result, status: 'needs-review' })).toBe(false);
    expect(isCanvasMarkdownCapabilityResult({ ...result, resolvedKind: 'creative-table' })).toBe(
      false,
    );
  });
});

function createTestContentLocator() {
  return {
    file: { authority: 'workspace' as const, path: 'assets/cover.png' },
  };
}
