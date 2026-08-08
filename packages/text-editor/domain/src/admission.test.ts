import { describe, expect, it } from 'vitest';
import { admitTextDocument, encodeTextDocument, modeForTextDocument } from './admission';
import { TEXT_DOCUMENT_MAX_BYTES } from './contracts';

const fingerprint = { strategy: 'sha256' as const, value: 'source' };

describe('Text Document admission', () => {
  it('maps only the declared case-insensitive extension allowlist', () => {
    expect(modeForTextDocument('notes/README.MD')).toBe('markdown');
    expect(modeForTextDocument('data/project.json')).toBe('json');
    expect(modeForTextDocument('scripts/story.fountain')).toBe('fountain');
    expect(modeForTextDocument('captions/scene.srt')).toBe('plain-text');
    expect(modeForTextDocument('archive.bin')).toBeUndefined();
  });

  it.each([
    { label: 'LF', source: '第一行\nSecond line\n', lineEnding: '\n' as const },
    { label: 'CRLF', source: '第一行\r\nSecond line\r\n', lineEnding: '\r\n' as const },
  ])('admits $label UTF-8 and preserves BOM and line endings on encode', (fixture) => {
    const sourceBytes = new TextEncoder().encode(fixture.source);
    const bytes = new Uint8Array(sourceBytes.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(sourceBytes, 3);

    const admitted = admitTextDocument('notes/中文.md', bytes, fingerprint);

    expect(admitted).toMatchObject({
      source: fixture.source.replace(/\r\n/g, '\n'),
      mode: 'markdown',
      lineEnding: fixture.lineEnding,
      hasBom: true,
      fingerprint,
      diagnostics: [],
    });
    expect(encodeTextDocument(admitted.source, admitted.lineEnding, admitted.hasBom)).toEqual(
      bytes,
    );
  });

  it.each([
    {
      label: 'unsupported extension',
      path: 'notes/archive.bin',
      bytes: new Uint8Array(),
      code: 'text-document-unsupported-extension',
    },
    {
      label: 'oversized source',
      path: 'notes/large.txt',
      bytes: new Uint8Array(TEXT_DOCUMENT_MAX_BYTES + 1),
      code: 'text-document-too-large',
    },
    {
      label: 'invalid UTF-8',
      path: 'notes/invalid.txt',
      bytes: new Uint8Array([0xc3, 0x28]),
      code: 'text-document-invalid-utf8',
    },
    {
      label: 'mixed line endings',
      path: 'notes/mixed.txt',
      bytes: new TextEncoder().encode('one\r\ntwo\n'),
      code: 'text-document-mixed-line-endings',
    },
    {
      label: 'bare carriage return',
      path: 'notes/carriage.txt',
      bytes: new TextEncoder().encode('one\rtwo'),
      code: 'text-document-mixed-line-endings',
    },
  ])('rejects $label without rewriting bytes', (fixture) => {
    const before = fixture.bytes.slice();

    expect(() => admitTextDocument(fixture.path, fixture.bytes, fingerprint)).toThrowError(
      expect.objectContaining({ diagnostic: { code: fixture.code, severity: 'error' } }),
    );
    expect(fixture.bytes).toEqual(before);
  });
});
