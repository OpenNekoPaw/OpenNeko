import { describe, expect, it } from 'vitest';
import { buildEntityUri, isEntityUri, parseEntityUri } from '../index';

describe('parseEntityUri', () => {
  it('parses URI with default purpose', () => {
    expect(parseEntityUri('entity://abc-123')).toEqual({
      entityId: 'abc-123',
      purpose: 'thumbnail',
    });
  });

  it('parses URI with explicit purpose', () => {
    expect(parseEntityUri('entity://abc-123/main')).toEqual({
      entityId: 'abc-123',
      purpose: 'main',
    });
    expect(parseEntityUri('entity://abc-123/preview')).toEqual({
      entityId: 'abc-123',
      purpose: 'preview',
    });
    expect(parseEntityUri('entity://abc-123/source')).toEqual({
      entityId: 'abc-123',
      purpose: 'source',
    });
    expect(parseEntityUri('entity://abc-123/texture')).toEqual({
      entityId: 'abc-123',
      purpose: 'texture',
    });
    expect(parseEntityUri('entity://abc-123/reference')).toEqual({
      entityId: 'abc-123',
      purpose: 'reference',
    });
  });

  it('returns null for empty entity id', () => {
    expect(parseEntityUri('entity://')).toBeNull();
  });

  it('returns null for wrong scheme', () => {
    expect(parseEntityUri('http://abc')).toBeNull();
    expect(parseEntityUri('asset://abc')).toBeNull();
    expect(parseEntityUri('file://abc')).toBeNull();
  });

  it('returns null for invalid purpose', () => {
    expect(parseEntityUri('entity://abc/invalid')).toBeNull();
    expect(parseEntityUri('entity://abc/MAIN')).toBeNull();
  });

  it('returns null for extra path segments', () => {
    expect(parseEntityUri('entity://abc/main/extra')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseEntityUri('')).toBeNull();
  });
});

describe('isEntityUri', () => {
  it('returns true for valid URIs', () => {
    expect(isEntityUri('entity://abc')).toBe(true);
    expect(isEntityUri('entity://abc-123/main')).toBe(true);
  });

  it('returns false for invalid URIs', () => {
    expect(isEntityUri('asset://abc')).toBe(false);
    expect(isEntityUri('http://entity')).toBe(false);
    expect(isEntityUri('')).toBe(false);
  });
});

describe('buildEntityUri', () => {
  it('builds URI without purpose (defaults to thumbnail)', () => {
    expect(buildEntityUri('abc-123')).toBe('entity://abc-123');
  });

  it('omits thumbnail purpose from URI', () => {
    expect(buildEntityUri('abc-123', 'thumbnail')).toBe('entity://abc-123');
  });

  it('includes non-default purpose', () => {
    expect(buildEntityUri('abc-123', 'main')).toBe('entity://abc-123/main');
    expect(buildEntityUri('abc-123', 'preview')).toBe('entity://abc-123/preview');
    expect(buildEntityUri('abc-123', 'source')).toBe('entity://abc-123/source');
  });

  it('roundtrips with parseEntityUri', () => {
    const uri = buildEntityUri('test-id', 'main');
    const parsed = parseEntityUri(uri);
    expect(parsed).toEqual({ entityId: 'test-id', purpose: 'main' });
  });
});
