import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordingPromotionService } from './RecordingPromotionService';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('RecordingPromotionService', () => {
  it('copies preview bytes before registering a portable project fact with provenance', async () => {
    const workDir = await createWorkspace();
    const sourcePath = join(workDir, '.neko', 'recordings', 'preview.webm');
    const destinationPath = join(workDir, 'media', 'recordings', 'take-1.webm');
    await mkdir(join(sourcePath, '..'), { recursive: true });
    await writeFile(sourcePath, 'preview bytes', 'utf8');
    const register = vi.fn(async (input) => {
      await expect(access(input.destinationPath)).resolves.toBeUndefined();
      return {
        entityId: 'entity-recording',
        variantId: 'variant-recording',
        fileId: 'file-recording',
        storedPath: '${WORKSPACE}/media/recordings/take-1.webm',
      };
    });
    const service = new RecordingPromotionService({ registerProjectFact: register });

    const result = await service.promote({
      sourcePath,
      destinationPath,
      workspaceRoot: workDir,
      sourceRecordingId: 'live-take-1',
      producer: 'neko-live',
      mediaType: 'video',
      recordedAt: 1_786_000_000_000,
      copyMode: 'copy-preview',
    });

    await expect(readFile(destinationPath, 'utf8')).resolves.toBe('preview bytes');
    expect(register).toHaveBeenCalledWith({
      destinationPath,
      mediaType: 'video',
      provenance: {
        sourceRecordingId: 'live-take-1',
        producer: 'neko-live',
        recordedAt: 1_786_000_000_000,
        sourceAuthority: 'preview-recording',
      },
    });
    expect(result.projectFact.storedPath).toBe('${WORKSPACE}/media/recordings/take-1.webm');
  });

  it('rejects promotion destinations under workspace .neko before copying bytes', async () => {
    const workDir = await createWorkspace();
    const sourcePath = join(workDir, '.neko', 'recordings', 'preview.wav');
    const destinationPath = join(workDir, '.neko', 'recordings', 'retained.wav');
    await mkdir(join(sourcePath, '..'), { recursive: true });
    await writeFile(sourcePath, 'preview bytes', 'utf8');
    const register = vi.fn();
    const service = new RecordingPromotionService({ registerProjectFact: register });

    await expect(
      service.promote({
        sourcePath,
        destinationPath,
        workspaceRoot: workDir,
        sourceRecordingId: 'audio-take-1',
        producer: 'neko-audio',
        mediaType: 'audio',
        recordedAt: 1,
        copyMode: 'copy-preview',
      }),
    ).rejects.toMatchObject({ code: 'recording-promotion-invalid-destination' });
    expect(register).not.toHaveBeenCalled();
  });

  it('keeps copied durable bytes but fails visibly when project fact registration fails', async () => {
    const workDir = await createWorkspace();
    const sourcePath = join(workDir, '.neko', 'recordings', 'preview.wav');
    const destinationPath = join(workDir, 'media', 'recordings', 'take-2.wav');
    await mkdir(join(sourcePath, '..'), { recursive: true });
    await writeFile(sourcePath, 'valuable recording', 'utf8');
    const service = new RecordingPromotionService({
      registerProjectFact: async () => {
        throw new Error('asset library unavailable');
      },
    });

    await expect(
      service.promote({
        sourcePath,
        destinationPath,
        workspaceRoot: workDir,
        sourceRecordingId: 'audio-take-2',
        producer: 'neko-audio',
        mediaType: 'audio',
        recordedAt: 2,
        copyMode: 'copy-preview',
      }),
    ).rejects.toMatchObject({
      code: 'recording-project-fact-write-failed',
      destinationPath,
    });
    await expect(readFile(destinationPath, 'utf8')).resolves.toBe('valuable recording');
  });
});

async function createWorkspace(): Promise<string> {
  const workDir = await mkdtemp(join(tmpdir(), 'neko-recording-promotion-'));
  temporaryDirectories.push(workDir);
  return workDir;
}
