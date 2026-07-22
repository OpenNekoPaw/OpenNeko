import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectData } from '../../types/project';
import {
  ProjectFileStore,
  createDefaultProjectFormatCodecRegistry,
  nkvSourcePathPolicy,
} from '../../project-file-io';
import {
  confirmLegacyWorkspaceMediaLibraryMigration,
  createLegacyWorkspaceMediaLibraryMigrationPlan,
  inspectLegacyWorkspaceMediaLibraryProject,
} from '../workspace-linked-media-library-migration';

const cleanupDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('legacy workspace media-library migration', () => {
  it('inspects and plans without changing project or settings bytes', async () => {
    const fixture = await createFixture('${BOOKS}/clips/shot.mp4');
    const originalProject = await readFile(fixture.projectFile);
    const originalSettings = await readFile(fixture.sharedSettingsFile);

    const session = await inspectLegacyWorkspaceMediaLibraryProject({
      workspaceRoot: fixture.workspace,
      projectFilePath: fixture.projectFile,
    });
    const result = await createLegacyWorkspaceMediaLibraryMigrationPlan(session, [
      { legacyVariable: 'BOOKS', libraryName: 'Books', targetDirectory: fixture.target },
    ]);

    expect(session.inspection.sources).toEqual([
      expect.objectContaining({
        kind: 'variable',
        variable: 'BOOKS',
        value: '${BOOKS}/clips/shot.mp4',
      }),
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.plan).toMatchObject({
      targets: [
        {
          legacyVariable: 'BOOKS',
          libraryName: 'Books',
          linkWorkspacePath: 'neko/assets/Books',
        },
      ],
      rewrites: [
        {
          previousValue: '${BOOKS}/clips/shot.mp4',
          workspacePath: 'neko/assets/Books/clips/shot.mp4',
        },
      ],
      fingerprints: [
        {
          sourceWorkspacePath: 'neko/assets/Books/clips/shot.mp4',
          sizeBytes: 'source-bytes'.length,
          contentHash: expect.stringMatching(/^sha256:/u),
        },
      ],
    });
    expect(await readFile(fixture.projectFile)).toEqual(originalProject);
    expect(await readFile(fixture.sharedSettingsFile)).toEqual(originalSettings);
  });

  it('confirms migration atomically, creates the link, and removes only retired settings fields', async () => {
    const fixture = await createFixture('${BOOKS}/clips/shot.mp4');
    const session = await inspectLegacyWorkspaceMediaLibraryProject({
      workspaceRoot: fixture.workspace,
      projectFilePath: fixture.projectFile,
    });
    const { plan } = await createLegacyWorkspaceMediaLibraryMigrationPlan(session, [
      { legacyVariable: 'BOOKS', libraryName: 'Books', targetDirectory: fixture.target },
    ]);
    expect(plan).toBeDefined();

    const result = await confirmLegacyWorkspaceMediaLibraryMigration(session, plan!);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    const migrated = JSON.parse(await readFile(fixture.projectFile, 'utf8')) as ProjectData;
    const source = migrated.tracks[0]?.elements[0];
    expect(source?.type === 'media' ? source.src : undefined).toBe(
      'neko/assets/Books/clips/shot.mp4',
    );
    expect(
      await readFile(path.join(fixture.workspace, 'neko/assets/Books/clips/shot.mp4'), 'utf8'),
    ).toBe('source-bytes');
    expect(JSON.parse(await readFile(fixture.sharedSettingsFile, 'utf8'))).toEqual({
      unrelated: { retained: true },
    });
    expect(JSON.parse(await readFile(fixture.localSettingsFile, 'utf8'))).toEqual({
      otherLocal: true,
    });
    const reopened = await createNodeProjectFileStore().load<ProjectData>({
      filePath: fixture.projectFile,
      sourcePolicy: nkvSourcePathPolicy,
      sourcePolicyOptions: {
        context: {
          owningWorkspaceRoot: fixture.workspace,
          workspaceRoots: [fixture.workspace],
          allowedRoots: [fixture.workspace],
        },
      },
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.readOnly).toBe(false);
    expect(reopened.diagnostics).toEqual([]);
  });

  it('maps an absolute legacy source through the selected replacement target', async () => {
    const fixture = await createFixture('${BOOKS}/clips/shot.mp4');
    const absoluteLegacySource = path.join(fixture.target, 'clips', 'shot.mp4');
    await writeFile(
      fixture.projectFile,
      `${JSON.stringify(createProject(absoluteLegacySource), null, 2)}\n`,
    );
    const session = await inspectLegacyWorkspaceMediaLibraryProject({
      workspaceRoot: fixture.workspace,
      projectFilePath: fixture.projectFile,
    });
    const result = await createLegacyWorkspaceMediaLibraryMigrationPlan(session, [
      { legacyVariable: 'BOOKS', libraryName: 'Books', targetDirectory: fixture.target },
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.plan?.rewrites).toEqual([
      expect.objectContaining({
        previousValue: absoluteLegacySource,
        workspacePath: 'neko/assets/Books/clips/shot.mp4',
      }),
    ]);
  });

  it('rejects fingerprint drift and preserves original project and settings bytes', async () => {
    const fixture = await createFixture('${BOOKS}/clips/shot.mp4');
    const session = await inspectLegacyWorkspaceMediaLibraryProject({
      workspaceRoot: fixture.workspace,
      projectFilePath: fixture.projectFile,
    });
    const { plan } = await createLegacyWorkspaceMediaLibraryMigrationPlan(session, [
      { legacyVariable: 'BOOKS', libraryName: 'Books', targetDirectory: fixture.target },
    ]);
    expect(plan).toBeDefined();
    const originalProject = await readFile(fixture.projectFile);
    const originalSettings = await readFile(fixture.sharedSettingsFile);
    await writeFile(path.join(fixture.target, 'clips/shot.mp4'), 'changed-source');

    await expect(confirmLegacyWorkspaceMediaLibraryMigration(session, plan!)).rejects.toThrow(
      'source changed after inspection',
    );
    expect(await readFile(fixture.projectFile)).toEqual(originalProject);
    expect(await readFile(fixture.sharedSettingsFile)).toEqual(originalSettings);
  });

  it('fails closed for an unknown legacy variable', async () => {
    const fixture = await createFixture('${UNKNOWN}/clips/shot.mp4');
    const session = await inspectLegacyWorkspaceMediaLibraryProject({
      workspaceRoot: fixture.workspace,
      projectFilePath: fixture.projectFile,
    });
    const result = await createLegacyWorkspaceMediaLibraryMigrationPlan(session, [
      { legacyVariable: 'BOOKS', libraryName: 'Books', targetDirectory: fixture.target },
    ]);

    expect(result.plan).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'migration-required',
        message: expect.stringContaining('UNKNOWN'),
      }),
      expect.objectContaining({ code: 'migration-required' }),
    ]);
  });
});

async function createFixture(source: string): Promise<{
  readonly workspace: string;
  readonly target: string;
  readonly projectFile: string;
  readonly sharedSettingsFile: string;
  readonly localSettingsFile: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-media-migration-'));
  cleanupDirectories.push(root);
  const workspace = path.join(root, 'workspace');
  const target = path.join(root, 'target');
  const projectFile = path.join(workspace, 'edit.nkv');
  const sharedSettingsFile = path.join(workspace, 'neko/settings.json');
  const localSettingsFile = path.join(workspace, '.neko/settings.local.json');
  await Promise.all([
    mkdir(path.dirname(sharedSettingsFile), { recursive: true }),
    mkdir(path.dirname(localSettingsFile), { recursive: true }),
    mkdir(path.join(target, 'clips'), { recursive: true }),
  ]);
  execFileSync('git', ['init', '--quiet', workspace]);
  await Promise.all([
    writeFile(projectFile, `${JSON.stringify(createProject(source), null, 2)}\n`),
    writeFile(
      sharedSettingsFile,
      `${JSON.stringify({
        mediaLibraries: [{ name: 'Legacy Books', path: target, variable: 'BOOKS' }],
        unrelated: { retained: true },
      })}\n`,
    ),
    writeFile(
      localSettingsFile,
      `${JSON.stringify({ mediaLibraryOverrides: { BOOKS: target }, otherLocal: true })}\n`,
    ),
    writeFile(path.join(target, 'clips/shot.mp4'), 'source-bytes'),
  ]);
  return { workspace, target, projectFile, sharedSettingsFile, localSettingsFile };
}

function createProject(source: string): ProjectData {
  return {
    version: '2.0',
    name: 'Legacy media project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Main',
        type: 'media',
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
        elements: [
          {
            id: 'element-1',
            type: 'media',
            name: 'Clip',
            src: source,
            duration: 1,
            startTime: 0,
            trimStart: 0,
            trimEnd: 0,
            transform: {
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              anchorX: 0,
              anchorY: 0,
            },
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          },
        ],
      },
    ],
  };
}

function createNodeProjectFileStore(): ProjectFileStore {
  return new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: {
      readFile: (filePath) => readFile(filePath),
      writeFile: (filePath, content) => writeFile(filePath, content),
    },
  });
}
