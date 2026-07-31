import { cp, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  applyCutCommand,
  createOtioTimeline,
  parseOtio,
  serializeOtio,
  type OtioTimeline,
} from '@neko-cut/domain';
import {
  CURRENT_NKC_VERSION,
  ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
  encodeEntityRepresentationBindingFile,
  loadNkc,
  type CanvasData,
} from '@neko/shared';
import { describe, expect, it } from 'vitest';
import {
  readDesktopProjectContentReferences,
  rewriteDesktopProjectContentReferences,
} from './desktop-project-content-reference-readers';

describe('Desktop project content reference readers', () => {
  it('combines validated Canvas, Cut, and Entity representation owners', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'neko-reference-readers-'));
    await mkdir(path.join(workspace, 'boards'), { recursive: true });
    await mkdir(path.join(workspace, 'cuts'), { recursive: true });
    await mkdir(path.join(workspace, 'neko'), { recursive: true });
    await writeFile(
      path.join(workspace, 'boards', 'story.nkc'),
      JSON.stringify(canvasFixture(), null, 2),
    );
    await writeFile(path.join(workspace, 'cuts', 'story.otio'), serializeOtio(cutFixture()));
    await writeFile(
      path.join(workspace, 'neko', 'entity-representation-bindings.json'),
      encodeEntityRepresentationBindingFile({
        version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
        bindings: [
          {
            id: 'binding-a',
            entityId: 'character-a',
            entityKind: 'character',
            representation: {
              kind: 'workspace-file',
              path: 'neko/assets/Portraits/character-a.png',
            },
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );

    const result = await readDesktopProjectContentReferences(workspace);

    expect(result.owners.map((owner) => owner.ownerKind)).toEqual([
      'canvas',
      'cut',
      'entity-representation',
    ]);
    expect(
      result.requirements.requirements.map((requirement) => ({
        name: requirement.libraryName,
        descendants: requirement.descendants,
      })),
    ).toEqual([
      { name: 'Footage', descendants: ['shot.mov'] },
      { name: 'Portraits', descendants: ['character-a.png'] },
      { name: 'References', descendants: ['board.png'] },
    ]);
  });

  it('does not traverse a linked directory while discovering project documents', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'neko-reference-readers-'));
    const external = await mkdtemp(path.join(tmpdir(), 'neko-external-documents-'));
    await writeFile(path.join(external, 'external.nkc'), JSON.stringify(canvasFixture()));
    await symlink(external, path.join(workspace, 'linked-documents'), 'dir');

    const result = await readDesktopProjectContentReferences(workspace);

    expect(result.owners).toEqual([
      expect.objectContaining({
        ownerKind: 'entity-representation',
        revision: 'absent',
        references: [],
      }),
    ]);
    expect(result.requirements.requirements).toEqual([]);
  });

  it('rewrites only staged owner documents through their owning codecs', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'neko-reference-source-'));
    const stagedWorkspace = await mkdtemp(path.join(tmpdir(), 'neko-reference-staged-'));
    await mkdir(path.join(workspace, 'boards'), { recursive: true });
    await mkdir(path.join(workspace, 'cuts'), { recursive: true });
    await mkdir(path.join(workspace, 'neko'), { recursive: true });
    await writeFile(
      path.join(workspace, 'boards', 'story.nkc'),
      JSON.stringify(canvasFixture(), null, 2),
    );
    await writeFile(path.join(workspace, 'cuts', 'story.otio'), serializeOtio(cutFixture()));
    await writeFile(
      path.join(workspace, 'neko', 'entity-representation-bindings.json'),
      encodeEntityRepresentationBindingFile({
        version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
        bindings: [
          {
            id: 'binding-a',
            entityId: 'character-a',
            entityKind: 'character',
            representation: {
              kind: 'workspace-file',
              path: 'neko/assets/Portraits/character-a.png',
            },
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
            source: 'user',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    );
    await cp(workspace, stagedWorkspace, { recursive: true });

    const rewritten = await rewriteDesktopProjectContentReferences({
      stagedWorkspacePath: stagedWorkspace,
      replacements: new Map([
        ['neko/assets/References/board.png', 'media/collected/References/board.png'],
        ['neko/assets/Footage/shot.mov', 'media/collected/Footage/shot.mov'],
        ['neko/assets/Portraits/character-a.png', 'media/collected/Portraits/character-a.png'],
      ]),
    });

    expect(rewritten.requirements.requirements).toEqual([]);
    const stagedCanvas = loadNkc(
      await readFile(path.join(stagedWorkspace, 'boards', 'story.nkc'), 'utf8'),
    );
    expect(stagedCanvas.validation.valid).toBe(true);
    const stagedMediaNode = stagedCanvas.data.nodes[0];
    expect(stagedMediaNode?.type).toBe('media');
    if (!stagedMediaNode || stagedMediaNode.type !== 'media') {
      throw new Error('Staged Canvas media fixture is missing.');
    }
    expect(stagedMediaNode.data.contentLocator).toEqual({
      kind: 'workspace-file',
      path: 'media/collected/References/board.png',
    });
    const stagedCut = parseOtio(await readFile(path.join(stagedWorkspace, 'cuts', 'story.otio')));
    expect(stagedCut.ok).toBe(true);
    if (stagedCut.ok) {
      expect(stagedCut.document.tracks.children[0]?.children[0]).toMatchObject({
        media_reference: {
          target_url: '../media/collected/Footage/shot.mov',
        },
      });
    }
    expect(
      JSON.parse(
        await readFile(
          path.join(stagedWorkspace, 'neko', 'entity-representation-bindings.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({
      bindings: [
        {
          representation: {
            kind: 'workspace-file',
            path: 'media/collected/Portraits/character-a.png',
          },
        },
      ],
    });
    expect(
      (await readDesktopProjectContentReferences(workspace)).requirements.requirements,
    ).toHaveLength(3);
  });
});

function canvasFixture(): CanvasData {
  return {
    version: CURRENT_NKC_VERSION,
    name: 'Story',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'media-a',
        type: 'media',
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
        zIndex: 1,
        data: {
          assetPath: 'neko/assets/References/board.png',
          contentLocator: {
            kind: 'workspace-file',
            path: 'neko/assets/References/board.png',
          },
        },
      },
    ],
    connections: [],
  };
}

function cutFixture(): OtioTimeline {
  const timeline = createOtioTimeline('Story', {
    profile: '1080p30',
    editRateNumerator: 30,
    editRateDenominator: 1,
    width: 1920,
    height: 1080,
  });
  return applyCutCommand(timeline, {
    type: 'link-media',
    trackId: 'video-1',
    clipId: 'clip-a',
    name: 'Shot',
    targetUrl: '../neko/assets/Footage/shot.mov',
    durationFrames: 30,
    rate: 30,
    timelineStartFrames: 0,
    overlapPolicy: 'reject',
  });
}
