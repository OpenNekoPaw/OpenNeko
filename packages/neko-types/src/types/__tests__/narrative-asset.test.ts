import { describe, expect, it } from 'vitest';
import {
  createNarrativeRelativePathAssetRef,
  isNarrativeAssetRef,
  validateNarrativeAssetRef,
} from '../narrative-asset';
import { createResourceFingerprint, createResourceRef } from '../resource-cache';

describe('narrative asset contracts', () => {
  const resourceRef = createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: {
      kind: 'file',
      projectRelativePath: 'assets/backgrounds/cafe.png',
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'cafe-v1' }),
  });

  it('accepts ResourceRef and project-relative path refs', () => {
    expect(isNarrativeAssetRef(resourceRef)).toBe(true);
    expect(isNarrativeAssetRef(createNarrativeRelativePathAssetRef('assets/hero.png'))).toBe(true);
    expect(validateNarrativeAssetRef(resourceRef)).toEqual([]);
    expect(validateNarrativeAssetRef({ kind: 'relative-path', path: 'assets/hero.png' })).toEqual(
      [],
    );
  });

  it('rejects runtime URLs and absolute paths as durable narrative refs', () => {
    expect(
      validateNarrativeAssetRef({
        kind: 'relative-path',
        path: 'vscode-webview-resource://panel/hero.png',
      }).map((diagnostic) => diagnostic.code),
    ).toEqual(['narrative-asset-runtime-ref']);
    expect(
      validateNarrativeAssetRef({ kind: 'relative-path', path: '/Users/me/assets/hero.png' }).map(
        (diagnostic) => diagnostic.code,
      ),
    ).toEqual(['narrative-asset-absolute-path']);
    expect(
      validateNarrativeAssetRef({ kind: 'relative-path', path: '' }).map(
        (diagnostic) => diagnostic.code,
      ),
    ).toEqual(['narrative-asset-empty-path']);
  });
});
