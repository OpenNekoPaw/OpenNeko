import { describe, expect, it, vi } from 'vitest';
import type { ContentRepresentationGenerator } from '../contracts';
import { ContentRepresentationRuntime } from './content-representation-runtime';

const source = { file: { authority: 'workspace', path: 'books/story.pdf' } } as const;

describe('ContentRepresentationRuntime', () => {
  it('keeps source, spec and generator binding private behind one opaque handle', async () => {
    const generator = createGenerator();
    const runtime = new ContentRepresentationRuntime({
      generators: [generator],
      createHandleId: () => 'handle-1',
    });

    const created = await runtime.getRepresentation({
      source,
      spec: { kind: 'raster-page', page: 1 },
      expectedSourceFingerprint: { strategy: 'sha256', value: 'sha256:source' },
    });
    expect(created).toEqual({
      status: 'ready',
      handle: { kind: 'content-representation-handle', id: 'handle-1' },
      metadata: { mimeType: 'image/png', byteLength: 3 },
    });
    expect(JSON.stringify(created)).not.toContain('story.pdf');
    expect(generator.generate).toHaveBeenCalledWith({
      source,
      spec: { kind: 'raster-page', page: 1 },
      expectedSourceFingerprint: { strategy: 'sha256', value: 'sha256:source' },
    });
  });

  it('invalidates handles after release and across runtime owners', async () => {
    const runtime = new ContentRepresentationRuntime({
      generators: [createGenerator()],
      createHandleId: () => 'handle-1',
    });
    const created = await runtime.getRepresentation({
      source,
      spec: { kind: 'raster-page', page: 1 },
    });
    if (created.status !== 'ready') throw new Error('Expected representation fixture.');

    expect(await runtime.readRepresentation(created.handle)).toMatchObject({ status: 'ready' });
    runtime.releaseRepresentation(created.handle);
    expect(await runtime.readRepresentation(created.handle)).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-missing' },
    });

    const restarted = new ContentRepresentationRuntime({
      generators: [createGenerator()],
      createHandleId: () => 'handle-2',
    });
    expect(await restarted.readRepresentation(created.handle)).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-missing' },
    });
  });
});

function createGenerator(): ContentRepresentationGenerator {
  return {
    id: 'pdf-raster',
    kinds: ['raster-page'],
    generate: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      metadata: { mimeType: 'image/png', byteLength: 3 },
    })),
  };
}
