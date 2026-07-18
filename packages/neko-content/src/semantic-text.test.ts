import type { SemanticSourceDescriptor, SemanticSourceFormat } from '@neko/shared';
import { describe, expect, it } from 'vitest';
import { extractSemanticText, SemanticTextExtractionError } from './semantic-text';

describe('semantic text extraction', () => {
  it('extracts plain paragraphs with stable ranges', () => {
    const segments = extractSemanticText({
      source: source('plain'),
      content: 'First line\nsecond line\n\nThird',
    });
    expect(segments).toEqual([
      expect.objectContaining({
        kind: 'plain',
        text: 'First line\nsecond line',
        range: expect.objectContaining({ startLine: 1, endLine: 2, startOffset: 0 }),
      }),
      expect.objectContaining({
        kind: 'plain',
        text: 'Third',
        range: expect.objectContaining({ startLine: 4 }),
      }),
    ]);
  });

  it('extracts visible Markdown blocks without raw HTML', () => {
    const segments = extractSemanticText({
      source: source('markdown'),
      content:
        '# Alice\n\n- meets Bob\n\n| Role | Name |\n| --- | --- |\n| Lead | Rin |\n\n<script>bad()</script>',
    });
    expect(segments.map((item) => [item.kind, item.text])).toEqual(
      expect.arrayContaining([
        ['heading', 'Alice'],
        ['list-item', 'meets Bob'],
        ['table-cell', 'Role'],
        ['table-cell', 'Rin'],
      ]),
    );
    expect(segments.some((item) => item.text.includes('bad()'))).toBe(false);
  });

  it('extracts Fountain structure and explicit candidate names', () => {
    const segments = extractSemanticText({
      source: source('fountain'),
      content: 'INT. OLD HOUSE - NIGHT\n\n@爱丽丝\nWe should leave.\n',
    });
    expect(segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'fountain-scene',
          explicitEntityKind: 'scene',
          explicitEntityName: 'OLD HOUSE',
        }),
        expect.objectContaining({
          kind: 'fountain-character',
          explicitEntityKind: 'character',
          explicitEntityName: '爱丽丝',
        }),
        expect.objectContaining({ kind: 'fountain-dialogue', text: 'We should leave.' }),
      ]),
    );
  });

  it('extracts structured JSON and YAML string paths', () => {
    const json = extractSemanticText({
      source: source('json'),
      content: '{"characters":[{"name":"Rin"}],"note":"hello"}',
    });
    expect(json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Rin',
          explicitEntityKind: 'character',
          explicitEntityName: 'Rin',
          range: expect.objectContaining({ structuredPath: ['characters', 0, 'name'] }),
        }),
      ]),
    );
    const yaml = extractSemanticText({
      source: source('yaml'),
      content: 'locations:\n  - name: Harbor\n',
    });
    expect(yaml).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Harbor',
          explicitEntityKind: 'location',
          explicitEntityName: 'Harbor',
        }),
      ]),
    );
  });

  it('fails visibly for invalid structured text, UTF-8, limits, and cancellation', () => {
    expect(() => extractSemanticText({ source: source('json'), content: '{' })).toThrowError(
      expect.objectContaining({ code: 'semantic-text-invalid-json' }),
    );
    expect(() =>
      extractSemanticText({ source: source('plain'), content: new Uint8Array([0xff]) }),
    ).toThrowError(expect.objectContaining({ code: 'semantic-text-invalid-utf8' }));
    expect(() =>
      extractSemanticText({ source: source('plain'), content: 'large', maxBytes: 1 }),
    ).toThrowError(expect.objectContaining({ code: 'semantic-text-oversized' }));
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      extractSemanticText({ source: source('plain'), content: 'text', signal: controller.signal }),
    ).toThrowError(SemanticTextExtractionError);
  });
});

function source(format: SemanticSourceFormat): SemanticSourceDescriptor {
  return {
    sourceId: `workspace:story.${format}`,
    workspaceId: 'workspace-1',
    rootId: 'workspace',
    rootKind: 'workspace',
    relativePath: `story.${format}`,
    portablePath: `${'${WORKSPACE}'}/story.${format}`,
    format,
    analysisMode: format === 'fountain' ? 'discover-candidates' : 'link-existing',
    fingerprint: 'sha256:test',
    sizeBytes: 10,
    modifiedAtMs: 1,
  };
}
