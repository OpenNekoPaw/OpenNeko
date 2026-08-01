import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  MEDIA_RUNTIME_DESCRIPTOR_SCHEMA,
  assertRuntimeDirectory,
  stagePackagedMediaRuntime,
} from '../media-runtime-closure.mjs';

describe('OpenNeko media runtime closure', () => {
  it('verifies target, checksums, and descriptor identity without PATH discovery', () => {
    const root = createFixtureRuntime();

    const verified = assertRuntimeDirectory(root, 'darwin-arm64');

    assert.equal(verified.descriptor.ffmpegVersion, '8.1.2');
    writeFileSync(join(root, 'bin', 'ffmpeg'), 'modified');
    assert.throws(() => assertRuntimeDirectory(root, 'darwin-arm64'), /checksum mismatch/u);
  });

  it('requires an explicit verified bundle for packaged payloads', () => {
    const stageRoot = mkdtempSync(join(tmpdir(), 'openneko-media-stage-'));
    assert.throws(
      () => stagePackagedMediaRuntime(stageRoot, 'win32-x64', undefined),
      /requires NEKO_MEDIA_RUNTIME_ROOT/u,
    );
  });

  it('rejects the pre-accelerator v1 descriptor schema', () => {
    const root = createFixtureRuntime();
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    descriptor.schemaVersion = 'openneko.media-runtime.v1';
    writeFileSync(descriptorPath, JSON.stringify(descriptor), 'utf8');

    assert.throws(() => assertRuntimeDirectory(root, 'darwin-arm64'), /descriptor is invalid/u);
  });

  it('rejects a descriptor that weakens the target capability floor', () => {
    const root = createFixtureRuntime();
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    descriptor.requiredCapabilities.filters = descriptor.requiredCapabilities.filters.filter(
      (filter) => filter !== 'loudnorm',
    );
    writeFileSync(descriptorPath, JSON.stringify(descriptor), 'utf8');

    assert.throws(
      () => assertRuntimeDirectory(root, 'darwin-arm64'),
      /weakens required filters capability loudnorm/u,
    );
  });

  it('requires the portable H.264 encoder for win32-x64', () => {
    const root = createFixtureRuntime('win32-x64');
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    descriptor.requiredCapabilities.encoders = descriptor.requiredCapabilities.encoders.filter(
      (encoder) => encoder !== 'h264',
    );
    writeFileSync(descriptorPath, JSON.stringify(descriptor), 'utf8');

    assert.throws(
      () => assertRuntimeDirectory(root, 'win32-x64'),
      /weakens required encoders capability h264/u,
    );
  });

  it('rejects the retired Linux descriptor target', () => {
    const root = createFixtureRuntime('win32-x64');
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    descriptor.target = 'linux-x64';
    writeFileSync(descriptorPath, JSON.stringify(descriptor), 'utf8');

    assert.throws(() => assertRuntimeDirectory(root, 'win32-x64'), /descriptor is invalid/u);
  });

  it('uses the Windows-native media build closure without Linux VAAPI', () => {
    const source = readFileSync('scripts/build-media-runtime.sh', 'utf8');

    assert.match(source, /win32-x64/u);
    assert.match(source, /--target-os=mingw32/u);
    assert.doesNotMatch(source, /--enable-vaapi/u);
    assert.doesNotMatch(source, /--enable-libdrm/u);
    assert.match(source, /--retry-all-errors/u);
  });
});

function createFixtureRuntime(target = 'darwin-arm64') {
  const root = mkdtempSync(join(tmpdir(), 'openneko-media-runtime-'));
  mkdirSync(join(root, 'bin'));
  const ffmpeg = Buffer.from('ffmpeg');
  const ffprobe = Buffer.from('ffprobe');
  const license = Buffer.from('license');
  writeFileSync(join(root, 'bin', 'ffmpeg'), ffmpeg);
  writeFileSync(join(root, 'bin', 'ffprobe'), ffprobe);
  writeFileSync(join(root, 'LICENSE'), license);
  writeFileSync(
    join(root, 'descriptor.json'),
    `${JSON.stringify({
      schemaVersion: MEDIA_RUNTIME_DESCRIPTOR_SCHEMA,
      target,
      ffmpegVersion: '8.1.2',
      ffprobeVersion: '8.1.2',
      license: { spdx: 'GPL-3.0-or-later', file: 'LICENSE', sha256: sha256(license) },
      executables: {
        ffmpeg: { file: 'bin/ffmpeg', sha256: sha256(ffmpeg) },
        ffprobe: { file: 'bin/ffprobe', sha256: sha256(ffprobe) },
      },
      requiredCapabilities: {
        hardwareAccelerators: target === 'darwin-arm64' ? ['videoToolbox'] : [],
        decoders: ['h264', 'hevc', 'av1', 'vp8', 'vp9', 'aac', 'mp3', 'flac', 'dts'],
        encoders: target === 'darwin-arm64' ? ['h264VideoToolbox', 'aac'] : ['h264', 'aac'],
        filters:
          target === 'darwin-arm64'
            ? ['alimiter', 'loudnorm', 'ebur128', 'scaleVt']
            : ['alimiter', 'loudnorm', 'ebur128'],
      },
    })}\n`,
  );
  return root;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
