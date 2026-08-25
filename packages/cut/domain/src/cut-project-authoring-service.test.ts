import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content-domain/node';
import { afterEach, describe, expect, it } from 'vitest';

import { serializeOtio } from './codec';
import {
  CutProjectAuthoringError,
  CutProjectAuthoringService,
} from './cut-project-authoring-service';
import { createOtioTimeline } from './document';

describe('CutProjectAuthoringService', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('queries and revision-safely authors an exact OTIO timeline without a Renderer', async () => {
    const fixture = await createFixture();
    const initial = await fixture.service.query({ documentPath: 'cuts/story.otio' });

    const updated = await fixture.service.apply({
      documentPath: 'cuts/story.otio',
      expectedFingerprint: initial.fingerprint,
      commands: [{ type: 'rename-track', trackId: 'video-1', name: 'Agent Video' }],
    });

    expect(initial.timeline.tracks[0]?.name).toBe('Video 1');
    expect(updated.timeline.tracks[0]?.name).toBe('Agent Video');
    expect(updated.fingerprint).not.toEqual(initial.fingerprint);
    expect(JSON.parse(await readFile(fixture.filePath, 'utf8'))).toMatchObject({
      tracks: { children: [{ name: 'Agent Video' }] },
    });
  });

  it('rejects stale freshness and preserves the newer OTIO bytes', async () => {
    const fixture = await createFixture();
    const initial = await fixture.service.query({ documentPath: 'cuts/story.otio' });
    await writeFile(fixture.filePath, serializeOtio(createTimeline('External Cut')));

    await expect(
      fixture.service.apply({
        documentPath: 'cuts/story.otio',
        expectedFingerprint: initial.fingerprint,
        commands: [{ type: 'rename-track', trackId: 'video-1', name: 'Stale Agent Video' }],
      }),
    ).rejects.toMatchObject({ code: 'stale-project' });
    expect(JSON.parse(await readFile(fixture.filePath, 'utf8'))).toMatchObject({
      name: 'External Cut',
    });
  });

  it('fails locally for invalid codec input and empty commands', async () => {
    const fixture = await createFixture();
    await writeFile(fixture.filePath, '{"OTIO_SCHEMA":"Timeline.1"}', 'utf8');
    await expect(fixture.service.query({ documentPath: 'cuts/story.otio' })).rejects.toMatchObject({
      code: 'invalid-document',
    });

    await writeFile(fixture.filePath, serializeOtio(createTimeline('Restored')));
    const restored = await fixture.service.query({ documentPath: 'cuts/story.otio' });
    await expect(
      fixture.service.apply({
        documentPath: 'cuts/story.otio',
        expectedFingerprint: restored.fingerprint,
        commands: [],
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CutProjectAuthoringError>>({ code: 'invalid-command' }),
    );
  });

  async function createFixture() {
    const root = await mkdtemp(join(tmpdir(), 'openneko-cut-agent-authoring-'));
    roots.push(root);
    const directory = join(root, 'cuts');
    const filePath = join(directory, 'story.otio');
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, serializeOtio(createTimeline('Fixture Cut')));
    return {
      filePath,
      service: new CutProjectAuthoringService({
        contentRead: createNodeHostContentReadService({ workspaceRoot: root }),
        workspaceWriter: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: root }),
      }),
    };
  }
});

function createTimeline(name: string) {
  return createOtioTimeline(name, {
    profile: '1080p30',
    editRateNumerator: 30,
    editRateDenominator: 1,
    width: 1920,
    height: 1080,
  });
}
