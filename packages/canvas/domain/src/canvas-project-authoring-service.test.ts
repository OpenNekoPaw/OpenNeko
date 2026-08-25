import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content-domain/node';
import { afterEach, describe, expect, it } from 'vitest';

import { saveNkc } from './nkc';
import {
  CanvasProjectAuthoringError,
  CanvasProjectAuthoringService,
} from './canvas-project-authoring-service';
import { createEmptyCanvasData } from './utils/canvasHeadlessAuthoring';

describe('CanvasProjectAuthoringService', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('queries and revision-safely authors an exact Canvas without a Renderer', async () => {
    const fixture = await createFixture();
    const initial = await fixture.service.query({ documentPath: 'boards/story.nkc' });

    const updated = await fixture.service.apply({
      documentPath: 'boards/story.nkc',
      expectedFingerprint: initial.fingerprint,
      operations: [{ kind: 'canvas.update', updates: { name: 'Agent Board' } }],
    });

    expect(initial.canvas.name).toBe('Fixture Board');
    expect(updated.canvas.name).toBe('Agent Board');
    expect(updated.fingerprint).not.toEqual(initial.fingerprint);
    expect(JSON.parse(await readFile(fixture.filePath, 'utf8'))).toMatchObject({
      name: 'Agent Board',
    });
  });

  it('rejects stale freshness and preserves the newer Canvas bytes', async () => {
    const fixture = await createFixture();
    const initial = await fixture.service.query({ documentPath: 'boards/story.nkc' });
    const external = saveNkc({ ...createEmptyCanvasData('External Board'), nodes: [] });
    await writeFile(fixture.filePath, external, 'utf8');

    await expect(
      fixture.service.apply({
        documentPath: 'boards/story.nkc',
        expectedFingerprint: initial.fingerprint,
        operations: [{ kind: 'canvas.update', updates: { name: 'Stale Agent Board' } }],
      }),
    ).rejects.toMatchObject({ code: 'stale-project' });
    expect(JSON.parse(await readFile(fixture.filePath, 'utf8'))).toMatchObject({
      name: 'External Board',
    });
  });

  it('fails locally for invalid codec input and empty operations', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.filePath, '{"name":"broken"}', 'utf8');
    await expect(fixture.service.query({ documentPath: 'boards/story.nkc' })).rejects.toMatchObject(
      { code: 'invalid-document' },
    );

    await writeFile(fixture.filePath, saveNkc(createEmptyCanvasData('Restored')), 'utf8');
    const restored = await fixture.service.query({ documentPath: 'boards/story.nkc' });
    await expect(
      fixture.service.apply({
        documentPath: 'boards/story.nkc',
        expectedFingerprint: restored.fingerprint,
        operations: [],
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CanvasProjectAuthoringError>>({
        code: 'invalid-operation',
      }),
    );
  });

  async function createFixture() {
    const root = await mkdtemp(join(tmpdir(), 'openneko-canvas-agent-authoring-'));
    roots.push(root);
    const directory = join(root, 'boards');
    const filePath = join(directory, 'story.nkc');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(directory, { recursive: true }));
    await writeFile(filePath, saveNkc(createEmptyCanvasData('Fixture Board')), 'utf8');
    return {
      filePath,
      service: new CanvasProjectAuthoringService({
        contentRead: createNodeHostContentReadService({ workspaceRoot: root }),
        workspaceWriter: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: root }),
      }),
    };
  }
});
