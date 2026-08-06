import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FfmpegProcessPort, FfmpegRunResult, RunningProcess } from './NodeFfmpegProcess';
import { verifyMediaRuntimeDirectory } from './MediaRuntimeDescriptor';

describe('MediaRuntimeDescriptor', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('verifies target, bytes, license, version, and mastering capabilities', async () => {
    const root = await createRuntimeRoot(roots);

    const verified = await verifyMediaRuntimeDirectory(root, 'darwin-arm64', {
      process: new QualifiedProcess(),
    });

    expect(verified.executables.ffmpeg).toBe(await realpath(join(root, 'bin', 'ffmpeg')));
    expect(verified.qualification.filters).toMatchObject({
      loudnorm: true,
      ebur128: true,
      alimiter: true,
      scaleVt: true,
    });
  });

  it('fails closed on a checksum mismatch', async () => {
    const root = await createRuntimeRoot(roots);
    await writeFile(join(root, 'bin', 'ffmpeg'), 'modified');

    await expect(
      verifyMediaRuntimeDirectory(root, 'darwin-arm64', {
        process: new QualifiedProcess(),
      }),
    ).rejects.toThrow('checksum mismatch');
  });

  it('rejects an unknown field without affecting another runtime directory', async () => {
    const [root, siblingRoot] = await Promise.all([
      createRuntimeRoot(roots),
      createRuntimeRoot(roots),
    ]);
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor: unknown = JSON.parse(await readFile(descriptorPath, 'utf8'));
    if (typeof descriptor !== 'object' || descriptor === null) {
      throw new Error('Fixture descriptor is invalid.');
    }
    Object.assign(descriptor, { unexpectedField: 1 });
    await writeFile(descriptorPath, JSON.stringify(descriptor), 'utf8');

    await expect(
      verifyMediaRuntimeDirectory(root, 'darwin-arm64', {
        process: new QualifiedProcess(),
      }),
    ).rejects.toThrow('unsupported: unexpectedField');
    await expect(
      verifyMediaRuntimeDirectory(siblingRoot, 'darwin-arm64', {
        process: new QualifiedProcess(),
      }),
    ).resolves.toMatchObject({ descriptor: { target: 'darwin-arm64' } });
  });

  it('fails closed when a declared capability is absent', async () => {
    const root = await createRuntimeRoot(roots);

    await expect(
      verifyMediaRuntimeDirectory(root, 'darwin-arm64', {
        process: new QualifiedProcess({ loudnorm: false }),
      }),
    ).rejects.toThrow('missing required filters capability loudnorm');
  });

  it('fails closed when the descriptor weakens the target capability floor', async () => {
    const root = await createRuntimeRoot(roots);
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor: unknown = JSON.parse(await readFile(descriptorPath, 'utf8'));
    if (
      typeof descriptor !== 'object' ||
      descriptor === null ||
      !('requiredCapabilities' in descriptor)
    ) {
      throw new Error('Fixture descriptor is invalid.');
    }
    const requiredCapabilities = descriptor.requiredCapabilities;
    if (
      typeof requiredCapabilities !== 'object' ||
      requiredCapabilities === null ||
      !('filters' in requiredCapabilities) ||
      !Array.isArray(requiredCapabilities.filters)
    ) {
      throw new Error('Fixture capability signature is invalid.');
    }
    requiredCapabilities.filters = requiredCapabilities.filters.filter(
      (filter) => filter !== 'loudnorm',
    );
    await writeFile(descriptorPath, JSON.stringify(descriptor), 'utf8');

    await expect(
      verifyMediaRuntimeDirectory(root, 'darwin-arm64', {
        process: new QualifiedProcess(),
      }),
    ).rejects.toThrow('Media runtime descriptor weakens required filters capability loudnorm.');
  });

  it('rejects Windows and Linux descriptor targets', async () => {
    const root = await createRuntimeRoot(roots);
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor: unknown = JSON.parse(await readFile(descriptorPath, 'utf8'));
    if (typeof descriptor !== 'object' || descriptor === null || !('target' in descriptor)) {
      throw new Error('Fixture descriptor is invalid.');
    }
    for (const target of ['win32-x64', 'linux-x64']) {
      descriptor.target = target;
      await writeFile(descriptorPath, JSON.stringify(descriptor), 'utf8');
      await expect(
        verifyMediaRuntimeDirectory(root, 'darwin-arm64', {
          process: new QualifiedProcess(),
        }),
      ).rejects.toThrow('Media runtime descriptor fields are invalid.');
    }
  });
});

class QualifiedProcess implements FfmpegProcessPort {
  constructor(private readonly missing: { readonly loudnorm?: false } = {}) {}

  async run(executable: 'ffmpeg' | 'ffprobe', args: readonly string[]): Promise<FfmpegRunResult> {
    const command = args.at(-1);
    if (command === '-version') {
      return { stdout: Buffer.from(`${executable} version 8.1.2\n`), stderr: '' };
    }
    if (command === '-decoders') {
      return {
        stdout: Buffer.from(
          ' V h264\n V hevc\n V av1\n V vp8\n V vp9\n A aac\n A mp3\n A flac\n A dca\n',
        ),
        stderr: '',
      };
    }
    if (command === '-hwaccels') {
      return {
        stdout: Buffer.from('Hardware acceleration methods:\nvideotoolbox\n'),
        stderr: '',
      };
    }
    if (command === '-encoders') {
      return {
        stdout: Buffer.from(' V libx264\n V h264_videotoolbox\n A aac\n'),
        stderr: '',
      };
    }
    if (command === '-filters') {
      return {
        stdout: Buffer.from(
          ` A alimiter\n A ebur128\n V scale_vt\n${this.missing.loudnorm === false ? '' : ' A loudnorm\n'}`,
        ),
        stderr: '',
      };
    }
    throw new Error(`Unexpected qualification command: ${args.join(' ')}`);
  }

  streamFfmpeg(): RunningProcess {
    throw new Error('Unexpected streaming command.');
  }
}

async function createRuntimeRoot(roots: string[]): Promise<string> {
  const target = 'darwin-arm64';
  const root = await mkdtemp(join(tmpdir(), 'openneko-media-runtime-'));
  roots.push(root);
  await mkdir(join(root, 'bin'));
  const ffmpeg = Buffer.from('ffmpeg-fixture');
  const ffprobe = Buffer.from('ffprobe-fixture');
  const license = Buffer.from('GPL-3.0-or-later fixture');
  await Promise.all([
    writeFile(join(root, 'bin', 'ffmpeg'), ffmpeg),
    writeFile(join(root, 'bin', 'ffprobe'), ffprobe),
    writeFile(join(root, 'LICENSE'), license),
  ]);
  await writeFile(
    join(root, 'descriptor.json'),
    `${JSON.stringify(
      {
        target,
        ffmpegVersion: '8.1.2',
        ffprobeVersion: '8.1.2',
        license: {
          spdx: 'GPL-3.0-or-later',
          file: 'LICENSE',
          sha256: sha256(license),
        },
        executables: {
          ffmpeg: { file: 'bin/ffmpeg', sha256: sha256(ffmpeg) },
          ffprobe: { file: 'bin/ffprobe', sha256: sha256(ffprobe) },
        },
        requiredCapabilities: {
          hardwareAccelerators: ['videoToolbox'],
          decoders: ['h264', 'hevc', 'av1', 'vp8', 'vp9', 'aac', 'mp3', 'flac', 'dts'],
          encoders: ['h264VideoToolbox', 'aac'],
          filters: ['alimiter', 'loudnorm', 'ebur128', 'scaleVt'],
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
