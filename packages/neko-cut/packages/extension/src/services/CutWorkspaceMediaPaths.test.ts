import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as nodeFs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { applyCutCommand, createOtioTimeline } from '@neko-cut/domain';
import { CutMediaPathError, CutWorkspaceMediaPaths } from './CutWorkspaceMediaPaths';

describe('CutWorkspaceMediaPaths', () => {
  let temporaryRoot: string;
  let workspaceRoot: string;
  let realWorkspaceRoot: string;
  let paths: CutWorkspaceMediaPaths;

  beforeEach(async () => {
    temporaryRoot = await nodeFs.mkdtemp(nodePath.join(nodeOs.tmpdir(), 'neko-cut-paths-'));
    workspaceRoot = nodePath.join(temporaryRoot, 'workspace');
    await nodeFs.mkdir(nodePath.join(workspaceRoot, 'projects', 'cut'), { recursive: true });
    await nodeFs.mkdir(nodePath.join(workspaceRoot, 'edits'), { recursive: true });
    await nodeFs.mkdir(nodePath.join(workspaceRoot, 'neko', 'assets', 'Footage'), {
      recursive: true,
    });
    await nodeFs.writeFile(
      nodePath.join(workspaceRoot, 'neko', 'assets', 'Footage', 'shot01.mp4'),
      'synthetic-media-bytes',
    );
    realWorkspaceRoot = await nodeFs.realpath(workspaceRoot);
    paths = await CutWorkspaceMediaPaths.create(workspaceRoot);
  });

  afterEach(async () => {
    await nodeFs.rm(temporaryRoot, { recursive: true, force: true });
  });

  it('persists document-relative links and projects one workspace-relative runtime source', async () => {
    const document = nodePath.join(workspaceRoot, 'projects', 'cut', 'demo.otio');
    const media = nodePath.join(realWorkspaceRoot, 'neko', 'assets', 'Footage', 'shot01.mp4');
    const before = await nodeFs.readFile(media);

    const targetUrl = await paths.linkMedia(document, 'neko/assets/Footage/shot01.mp4');
    const resolved = await paths.resolveTarget(document, targetUrl);

    expect(targetUrl).toBe('../../neko/assets/Footage/shot01.mp4');
    expect(resolved).toEqual({
      status: 'available',
      workspaceRelativePath: 'neko/assets/Footage/shot01.mp4',
      filePath: media,
    });
    expect(await nodeFs.readFile(media)).toEqual(before);
  });

  it('reports a missing document-relative target without falling back to workspace root', async () => {
    const document = nodePath.join(workspaceRoot, 'projects', 'cut', 'demo.otio');
    const resolved = await paths.resolveTarget(document, '../../neko/assets/missing.mp4');

    expect(resolved).toEqual({
      status: 'missing',
      workspaceRelativePath: 'neko/assets/missing.mp4',
      filePath: nodePath.join(realWorkspaceRoot, 'neko', 'assets', 'missing.mp4'),
      diagnostic: 'missing-media',
    });
  });

  it('rebases every ExternalReference during Save As while preserving its media target', async () => {
    const oldDocument = nodePath.join(workspaceRoot, 'projects', 'cut', 'demo.otio');
    const newDocument = nodePath.join(workspaceRoot, 'edits', 'demo.otio');
    let document = createOtioTimeline('Demo', {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    });
    document = applyCutCommand(document, {
      type: 'link-media',
      clipId: 'clip-1',
      name: 'Shot',
      targetUrl: '../../neko/assets/Footage/shot01.mp4',
      durationFrames: 30,
      rate: 30,
      trackId: 'video-1',
    });

    const rebased = await paths.rebaseDocument(document, oldDocument, newDocument);
    const clip = rebased.tracks.children[0]?.children[0];
    expect(clip).toMatchObject({
      media_reference: { target_url: '../neko/assets/Footage/shot01.mp4' },
    });
    if (clip?.OTIO_SCHEMA !== 'Clip.2') throw new Error('Expected Clip fixture.');
    await expect(
      paths.resolveTarget(newDocument, clip.media_reference.target_url),
    ).resolves.toMatchObject({
      status: 'available',
      workspaceRelativePath: 'neko/assets/Footage/shot01.mp4',
    });
  });

  it('rejects absolute/runtime URLs, lexical escape and symlink escape', async () => {
    const document = nodePath.join(workspaceRoot, 'projects', 'cut', 'demo.otio');
    await expect(paths.resolveTarget(document, '/tmp/shot.mp4')).rejects.toBeInstanceOf(
      CutMediaPathError,
    );
    await expect(paths.resolveTarget(document, 'file:///tmp/shot.mp4')).rejects.toBeInstanceOf(
      CutMediaPathError,
    );
    await expect(paths.resolveTarget(document, '../../../../outside.mp4')).rejects.toMatchObject({
      code: 'workspace-escape',
    });

    const outside = nodePath.join(temporaryRoot, 'outside');
    await nodeFs.mkdir(outside);
    await nodeFs.writeFile(nodePath.join(outside, 'secret.mp4'), 'outside');
    await nodeFs.symlink(outside, nodePath.join(workspaceRoot, 'neko', 'assets', 'escape'));
    await expect(
      paths.resolveTarget(document, '../../neko/assets/escape/secret.mp4'),
    ).rejects.toMatchObject({ code: 'symlink-escape' });
  });

  it('uses the configured project root only for the new document destination', () => {
    expect(paths.resolveDefaultProjectPath('projects/cut', 'demo')).toBe(
      nodePath.join(workspaceRoot, 'projects', 'cut', 'demo.otio'),
    );
    expect(() => paths.resolveDefaultProjectPath('../outside', 'demo')).toThrow(CutMediaPathError);
  });
});
