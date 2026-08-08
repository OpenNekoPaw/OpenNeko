import { describe, expect, it } from 'vitest';
import { assessOpenNekoMarkdownRichRoundTrip } from '../index';

describe('OpenNeko Markdown Rich round-trip assessment', () => {
  it('accepts declared semantic normalization for portable GFM', () => {
    expect(
      assessOpenNekoMarkdownRichRoundTrip(
        '~single~ and Visit www.example.com',
        '~~single~~ and Visit [www.example.com](http://www.example.com)\n',
      ),
    ).toEqual({ status: 'ready' });
    expect(
      assessOpenNekoMarkdownRichRoundTrip(
        '[说明][ref]\n\n[ref]: https://example.com',
        '[说明](https://example.com)\n',
      ),
    ).toEqual({ status: 'ready' });
  });

  it('rejects dropped unused definitions and changed content', () => {
    expect(
      assessOpenNekoMarkdownRichRoundTrip('正文\n\n[unused]: https://example.com', '正文\n'),
    ).toMatchObject({ status: 'unavailable', reason: 'semantic-mismatch' });
    expect(assessOpenNekoMarkdownRichRoundTrip('原文', '改写')).toMatchObject({
      status: 'unavailable',
      reason: 'semantic-mismatch',
    });
  });

  it('requires a source-preserving adapter for declared product extensions', () => {
    expect(
      assessOpenNekoMarkdownRichRoundTrip(
        '请让 @小橘 查看 [[script.md]]。',
        '请让 @小橘 查看 \\[[script.md]]。\n',
      ),
    ).toEqual({
      status: 'unavailable',
      reason: 'source-preserving-adapter-required',
      extensions: ['neko-mention', 'neko-resource-reference'],
    });
    expect(assessOpenNekoMarkdownRichRoundTrip('正文[^1]\n\n[^1]: 注释', '正文[^1]')).toEqual({
      status: 'unavailable',
      reason: 'source-preserving-adapter-required',
      extensions: ['footnote'],
    });
    expect(assessOpenNekoMarkdownRichRoundTrip('行内 $x^2$', '行内 $x^2$')).toEqual({
      status: 'unavailable',
      reason: 'source-preserving-adapter-required',
      extensions: ['math'],
    });
  });

  it('preserves raw HTML only as inert source semantics', () => {
    expect(
      assessOpenNekoMarkdownRichRoundTrip(
        '<script>alert(1)</script>',
        '<script>alert(1)</script>\n',
      ),
    ).toEqual({ status: 'ready' });
  });
});
