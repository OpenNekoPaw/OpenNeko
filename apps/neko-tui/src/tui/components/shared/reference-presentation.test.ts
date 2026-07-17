import { describe, expect, it } from 'vitest';
import { projectReferencePresentation } from './ReferenceAwareText';

describe('projectReferencePresentation', () => {
  it('compacts multiple path references and preserves surrounding text', () => {
    expect(
      projectReferencePresentation(
        'compare @${A}/books/one.epub with @"docs/second edition.pdf" now',
      ).map(({ kind, text }) => ({ kind, text })),
    ).toEqual([
      { kind: 'text', text: 'compare ' },
      { kind: 'reference', text: '@one.epub' },
      { kind: 'text', text: ' with ' },
      { kind: 'reference', text: '@second edition.pdf' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('styles durable identifiers without treating email addresses as references', () => {
    expect(
      projectReferencePresentation('mail user@example.com and use @asset:hero').map(
        ({ kind, text }) => ({ kind, text }),
      ),
    ).toEqual([
      { kind: 'text', text: 'mail user@example.com and use ' },
      { kind: 'reference', text: '@asset:hero' },
    ]);
  });
});
