import { describe, expect, it, vi } from 'vitest';
import { MEDIA_QUALITY_CONTRACT_VERSION, TOOL_NAMES_QUALITY, type ResourceRef } from '@neko/shared';
import { createCanonicalQualityCheckTools } from '../canonical-quality-tools';
import * as qualityExports from '../index';

const resourceRef: ResourceRef = {
  id: 'asset:image:cat',
  scope: 'project',
  provider: 'project',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'neko/generated/image/cat.png' },
  fingerprint: { strategy: 'hash', value: 'sha256:cat-v1' },
};

function canonicalTarget() {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    targetId: 'asset-cat',
    kind: 'image',
    resourceRef,
    revision: 'rev-1',
    contentDigest: 'sha256:cat-v1',
    expectedIntent: { prompt: 'A playful orange cat.' },
  };
}

describe('quality tool export surface', () => {
  it('does not export path-only legacy Quality tool factories', () => {
    expect(Reflect.has(qualityExports, 'createLegacyQualityCheckTools')).toBe(false);
    expect(Reflect.has(qualityExports, 'createLegacyConsistencyCheckTools')).toBe(false);
  });
});

describe('canonical quality tools', () => {
  it('invokes the canonical review handler with a stable revision-bound target', async () => {
    const review = vi.fn().mockResolvedValue({ verdict: 'pass' });
    const [tool] = createCanonicalQualityCheckTools({ review });

    expect(tool?.name).toBe(TOOL_NAMES_QUALITY.QUALITY_CHECK);
    await expect(tool?.execute({ target: canonicalTarget() })).resolves.toEqual({
      success: true,
      data: { verdict: 'pass' },
    });
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ targetId: 'asset-cat', resourceRef }),
        policy: expect.objectContaining({
          requiredEvaluatorClasses: ['perception'],
          allowManualReview: true,
        }),
      }),
      undefined,
    );
  });

  it('poisons path-only legacy requests before the canonical handler runs', async () => {
    const review = vi.fn();
    const [tool] = createCanonicalQualityCheckTools({ review });

    await expect(
      tool?.execute({
        mediaPath: '/tmp/cat.png',
        target: canonicalTarget(),
      }),
    ).rejects.toThrow('legacy-path-target-rejected');
    expect(review).not.toHaveBeenCalled();
  });

  it('rejects malformed optional target fields instead of silently dropping them', async () => {
    const review = vi.fn();
    const [tool] = createCanonicalQualityCheckTools({ review });

    await expect(
      tool?.execute({
        target: {
          ...canonicalTarget(),
          mediaRange: { startSeconds: 'zero', endSeconds: 1 },
        },
      }),
    ).rejects.toThrow('invalid-quality-target: mediaRange fields must be numbers');
    expect(review).not.toHaveBeenCalled();
  });

  it('rejects a malformed resourceRef even when a valid projectRef is also supplied', async () => {
    const review = vi.fn();
    const [tool] = createCanonicalQualityCheckTools({ review });

    await expect(
      tool?.execute({
        target: {
          ...canonicalTarget(),
          resourceRef: { id: 'not-a-resource-ref' },
          projectRef: {
            domain: 'cut',
            documentUri: 'project://movie.nkv',
            projectRevision: 'rev-1',
          },
        },
      }),
    ).rejects.toThrow('invalid-quality-target: resourceRef is malformed');
    expect(review).not.toHaveBeenCalled();
  });

  it('rejects targets without a durable revision or digest', async () => {
    const review = vi.fn();
    const [tool] = createCanonicalQualityCheckTools({ review });
    const invalid = canonicalTarget();
    const target = {
      version: invalid.version,
      targetId: invalid.targetId,
      kind: invalid.kind,
      resourceRef: invalid.resourceRef,
    };

    await expect(tool?.execute({ target })).rejects.toThrow('invalid-quality-target');
    expect(review).not.toHaveBeenCalled();
  });
});
