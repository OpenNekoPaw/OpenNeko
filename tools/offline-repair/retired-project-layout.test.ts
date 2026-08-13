import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadNkc } from '@neko/canvas-domain';
import { applyCutCommand, createOtioTimeline, parseOtio, serializeOtio } from '@neko/cut-domain';
import { decodeProjectEntityDocument } from '@neko/entity-domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RETIRED_PROJECT_CONVERSION_CONFIRMATION_PREFIX,
  convertRetiredProjectLayout,
  inspectRetiredProjectLayout,
} from './retired-project-layout';

const WORKSPACE_ID = 'c936c506-a762-4f11-976e-e8500d05106c';
const PROJECT_ID = `content:${WORKSPACE_ID}`;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('retired Project layout offline conversion', () => {
  it('inspects without writing, then backs up and atomically converts exact recognized owners', async () => {
    const fixture = await createFixture();
    const sourceComposition = await readFile(
      path.join(fixture.workspace, 'neko', 'project-composition.json'),
      'utf8',
    );

    const inspection = await inspectRetiredProjectLayout({
      target: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalRoot,
    });

    expect(inspection).toMatchObject({
      ready: true,
      projectId: PROJECT_ID,
      composition: 'recognized',
      associations: 1,
      mediaLibraries: [
        {
          libraryName: 'Footage',
          connectionId: 'media-library:local:Footage',
        },
      ],
    });
    expect(
      inspection.linkedMediaReferences.reduce((total, owner) => total + owner.referenceCount, 0),
    ).toBe(3);
    await expect(
      readFile(path.join(fixture.workspace, 'neko', 'project-composition.json'), 'utf8'),
    ).resolves.toBe(sourceComposition);
    expect(await readdir(path.dirname(fixture.workspace))).toEqual(
      expect.arrayContaining([path.basename(fixture.workspace), 'external', 'global']),
    );

    const result = await convertRetiredProjectLayout({
      target: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalRoot,
      expectedFingerprint: inspection.fingerprint,
      confirmation: `${RETIRED_PROJECT_CONVERSION_CONFIRMATION_PREFIX}${PROJECT_ID}`,
      now: () => new Date('2026-08-13T00:00:00.000Z'),
      createId: idSequence('staging-id', 'backup-id'),
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      associationCount: 1,
      mediaLibraryCount: 1,
      rewrittenReferenceCount: 3,
    });
    await expect(
      stat(path.join(fixture.workspace, 'neko', 'project-composition.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(path.join(fixture.workspace, 'neko', 'assets'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      readFile(path.join(result.backup, 'neko', 'project-composition.json'), 'utf8'),
    ).resolves.toBe(sourceComposition);
    expect(
      JSON.parse(
        await readFile(
          path.join(
            fixture.workspace,
            'neko',
            'project-bindings',
            'entity-character',
            'u65-6e-74-69-74-79-2d-61.json',
          ),
          'utf8',
        ),
      ),
    ).toEqual({
      projectId: PROJECT_ID,
      entityId: 'entity-a',
      characterProjectId: 'character-a',
    });
    expect(
      JSON.parse(
        await readFile(
          path.join(fixture.workspace, '.neko', 'media-libraries', 'Footage.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({
      projectId: PROJECT_ID,
      libraryName: 'Footage',
      connectionId: 'media-library:local:Footage',
    });
    const canvas = loadNkc(await readFile(path.join(fixture.workspace, 'story.nkc'), 'utf8'));
    expect(canvas.validation.valid).toBe(true);
    expect(canvas.data.nodes[0]).toMatchObject({
      data: {
        assetPath: 'Footage/shots/opening.mov',
        contentLocator: {
          kind: 'media-library',
          libraryName: 'Footage',
          relativePath: 'shots/opening.mov',
        },
      },
    });
    const entities = decodeProjectEntityDocument(
      JSON.parse(await readFile(path.join(fixture.workspace, 'neko', 'entities.json'), 'utf8')),
    );
    expect(entities.ok).toBe(true);
    if (entities.ok) {
      expect(entities.document.entities[0]?.representations[0]?.target).toEqual({
        kind: 'media-library',
        libraryName: 'Footage',
        relativePath: 'portraits/a.png',
      });
    }
    const cut = parseOtio(await readFile(path.join(fixture.workspace, 'story.otio')));
    expect(cut.ok).toBe(true);
    if (cut.ok) {
      expect(cut.document.tracks.children[0]?.children[0]).toMatchObject({
        media_reference: {
          target_url: 'media-library:Footage/shots/opening.mov',
        },
      });
    }
  });

  it('rejects stale inspection before backup or mutation', async () => {
    const fixture = await createFixture();
    const inspection = await inspectRetiredProjectLayout({
      target: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalRoot,
    });
    const compositionPath = path.join(fixture.workspace, 'neko', 'project-composition.json');
    const changedSource = `${await readFile(compositionPath, 'utf8')}\n`;
    await writeFile(compositionPath, changedSource);

    await expect(
      convertRetiredProjectLayout({
        target: fixture.workspace,
        globalMediaLibraryRoot: fixture.globalRoot,
        expectedFingerprint: inspection.fingerprint,
        confirmation: `${RETIRED_PROJECT_CONVERSION_CONFIRMATION_PREFIX}${PROJECT_ID}`,
      }),
    ).rejects.toThrow('stale');
    await expect(readFile(compositionPath, 'utf8')).resolves.toBe(changedSource);
    expect(
      (await readdir(path.dirname(fixture.workspace))).some((name) => name.includes('backup')),
    ).toBe(false);
  });

  it('reports unsupported explicit dependencies and performs no conversion', async () => {
    const fixture = await createFixture();
    const compositionPath = path.join(fixture.workspace, 'neko', 'project-composition.json');
    const composition = JSON.parse(await readFile(compositionPath, 'utf8')) as Record<
      string,
      unknown
    >;
    composition['dependencies'] = [
      { kind: 'character-version', characterVersionId: 'unassigned-version' },
    ];
    await writeFile(compositionPath, JSON.stringify(composition));

    const inspection = await inspectRetiredProjectLayout({
      target: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalRoot,
    });

    expect(inspection.ready).toBe(false);
    expect(inspection.diagnostics).toContainEqual(expect.stringContaining('explicit dependencies'));
    expect(
      (await readdir(path.dirname(fixture.workspace))).some((name) => name.includes('backup')),
    ).toBe(false);
  });

  it('converts a linked document entry and a retired composition without association rows', async () => {
    const fixture = await createFixture();
    const compositionPath = path.join(fixture.workspace, 'neko', 'project-composition.json');
    const composition = JSON.parse(await readFile(compositionPath, 'utf8')) as Record<
      string,
      unknown
    >;
    delete composition['entityCharacterAssociations'];
    await writeFile(compositionPath, JSON.stringify(composition));

    const canvasPath = path.join(fixture.workspace, 'story.nkc');
    const canvas = JSON.parse(await readFile(canvasPath, 'utf8')) as {
      nodes: Array<{ data: Record<string, unknown> }>;
    };
    const firstNode = canvas.nodes[0];
    if (!firstNode) throw new Error('Retired Canvas fixture has no node.');
    firstNode.data['assetPath'] = '';
    firstNode.data['contentLocator'] = {
      kind: 'document-entry',
      source: {
        kind: 'workspace-file',
        path: 'neko/assets/Footage/shots/opening.mov',
      },
      entryPath: 'images/cover.jpg',
    };
    await writeFile(canvasPath, JSON.stringify(canvas));

    const inspection = await inspectRetiredProjectLayout({
      target: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalRoot,
    });
    expect(inspection).toMatchObject({ ready: true, associations: 0 });

    const result = await convertRetiredProjectLayout({
      target: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalRoot,
      expectedFingerprint: inspection.fingerprint,
      confirmation: `${RETIRED_PROJECT_CONVERSION_CONFIRMATION_PREFIX}${PROJECT_ID}`,
      now: () => new Date('2026-08-13T00:00:00.000Z'),
      createId: idSequence('entry-staging', 'entry-backup'),
    });

    expect(result).toMatchObject({ associationCount: 0, rewrittenReferenceCount: 3 });
    const converted = loadNkc(await readFile(path.join(fixture.workspace, 'story.nkc'), 'utf8'));
    expect(converted.validation.valid).toBe(true);
    expect(converted.data.nodes[0]).toMatchObject({
      data: {
        contentLocator: {
          kind: 'document-entry',
          source: {
            kind: 'media-library',
            libraryName: 'Footage',
            relativePath: 'shots/opening.mov',
          },
          entryPath: 'images/cover.jpg',
        },
      },
    });
  });
});

async function createFixture(): Promise<{
  workspace: string;
  globalRoot: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-retired-project-'));
  roots.push(root);
  const workspace = path.join(root, 'workspace');
  const globalRoot = path.join(root, 'global');
  const external = path.join(root, 'external', 'Footage');
  await Promise.all([
    mkdir(path.join(workspace, 'neko', 'assets'), { recursive: true }),
    mkdir(path.join(workspace, 'neko', 'characters', 'character-a'), { recursive: true }),
    mkdir(path.join(globalRoot, 'local'), { recursive: true }),
    mkdir(path.join(globalRoot, 'nas'), { recursive: true }),
    mkdir(path.join(globalRoot, 'cloud'), { recursive: true }),
    mkdir(path.join(external, 'shots'), { recursive: true }),
    mkdir(path.join(external, 'portraits'), { recursive: true }),
  ]);
  await Promise.all([
    symlink(external, path.join(workspace, 'neko', 'assets', 'Footage'), 'dir'),
    symlink(external, path.join(globalRoot, 'local', 'Footage'), 'dir'),
    writeFile(
      path.join(workspace, 'neko', 'project.json'),
      JSON.stringify({ workspaceId: WORKSPACE_ID }),
    ),
    writeFile(
      path.join(workspace, 'neko', 'project-composition.json'),
      JSON.stringify({
        contentProjectId: PROJECT_ID,
        localTargets: [{ kind: 'character-project', characterProjectId: 'character-a' }],
        dependencies: [],
        entityCharacterAssociations: [{ entityId: 'entity-a', characterProjectId: 'character-a' }],
      }),
    ),
    writeFile(
      path.join(workspace, 'neko', 'characters', 'character-a', 'project.json'),
      JSON.stringify(characterProject()),
    ),
    writeFile(path.join(workspace, 'story.nkc'), JSON.stringify(retiredCanvas())),
    writeFile(path.join(workspace, 'story.otio'), serializeOtio(retiredCut())),
    writeFile(path.join(workspace, 'neko', 'entities.json'), JSON.stringify(retiredEntities())),
  ]);
  return { workspace, globalRoot };
}

function retiredCut() {
  const timeline = createOtioTimeline('Retired cut', {
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
    name: 'Opening',
    targetUrl: 'neko/assets/Footage/shots/opening.mov',
    durationFrames: 30,
    rate: 30,
    timelineStartFrames: 0,
    overlapPolicy: 'reject',
  });
}

function retiredCanvas() {
  return {
    name: 'Retired story',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'media-a',
        type: 'media',
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
        zIndex: 1,
        data: {
          assetPath: 'neko/assets/Footage/shots/opening.mov',
          contentLocator: {
            kind: 'workspace-file',
            path: 'neko/assets/Footage/shots/opening.mov',
          },
        },
      },
    ],
    connections: [],
  };
}

function retiredEntities() {
  return {
    projectId: WORKSPACE_ID,
    entities: [
      {
        entityId: 'entity-a',
        kind: 'character',
        names: { canonical: 'Entity A', aliases: [] },
        representations: [
          {
            bindingId: 'binding-a',
            role: 'portrait',
            target: {
              kind: 'workspace-file',
              path: 'neko/assets/Footage/portraits/a.png',
            },
            source: 'user',
            acceptedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        lifecycle: { state: 'active' },
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
  };
}

function characterProject() {
  const emptyLore = {
    overview: '',
    origins: [],
    personalHistory: [],
    formativeEvents: [],
    establishedRelationships: [],
  };
  return {
    characterProjectId: 'character-a',
    displayName: 'Character A',
    draft: {
      summary: '',
      backgroundStory: emptyLore,
      originSetting: {
        overview: '',
        eras: [],
        cultures: [],
        socialEnvironment: [],
        importantPlaces: [],
        organizations: [],
        believedRules: [],
      },
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function idSequence(...ids: readonly string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `unexpected-${String(index)}`;
}
