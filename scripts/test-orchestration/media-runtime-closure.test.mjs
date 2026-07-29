import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  MEDIA_RUNTIME_DESCRIPTOR_SCHEMA,
  assertRuntimeDirectory,
  copyResolvedDevelopmentFile,
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
      () => stagePackagedMediaRuntime(stageRoot, 'linux-x64', undefined),
      /requires NEKO_MEDIA_RUNTIME_ROOT/u,
    );
  });

  it('dereferences development executable symlinks into the owned stage', () => {
    const root = mkdtempSync(join(tmpdir(), 'openneko-media-symlink-'));
    const source = join(root, 'ffmpeg-real');
    const link = join(root, 'ffmpeg');
    const destination = join(root, 'stage', 'ffmpeg');
    writeFileSync(source, 'runtime');
    symlinkSync(source, link);
    mkdirSync(join(root, 'stage'));

    copyResolvedDevelopmentFile(link, destination);

    assert.equal(lstatSync(destination).isSymbolicLink(), false);
    assert.equal(readFileSync(destination, 'utf8'), 'runtime');
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

  it('requires the VAAPI encoder and scale filter for linux-x64', () => {
    const root = createFixtureRuntime('linux-x64');
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    descriptor.requiredCapabilities.encoders = descriptor.requiredCapabilities.encoders.filter(
      (encoder) => encoder !== 'h264Vaapi',
    );
    writeFileSync(descriptorPath, JSON.stringify(descriptor), 'utf8');

    assert.throws(
      () => assertRuntimeDirectory(root, 'linux-x64'),
      /weakens required encoders capability h264Vaapi/u,
    );
  });

  it('requires the VAAPI decode accelerator for linux-x64', () => {
    const root = createFixtureRuntime('linux-x64');
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    descriptor.requiredCapabilities.hardwareAccelerators =
      descriptor.requiredCapabilities.hardwareAccelerators.filter(
        (accelerator) => accelerator !== 'vaapi',
      );
    writeFileSync(descriptorPath, JSON.stringify(descriptor), 'utf8');

    assert.throws(
      () => assertRuntimeDirectory(root, 'linux-x64'),
      /weakens required hardwareAccelerators capability vaapi/u,
    );
  });

  it('requires the VAAPI HDR tone-map filter for linux-x64', () => {
    const root = createFixtureRuntime('linux-x64');
    const descriptorPath = join(root, 'descriptor.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
    descriptor.requiredCapabilities.filters = descriptor.requiredCapabilities.filters.filter(
      (filter) => filter !== 'tonemapVaapi',
    );
    writeFileSync(descriptorPath, JSON.stringify(descriptor), 'utf8');

    assert.throws(
      () => assertRuntimeDirectory(root, 'linux-x64'),
      /weakens required filters capability tonemapVaapi/u,
    );
  });

  it('enables the Linux VAAPI and libdrm build closure explicitly', () => {
    const source = readFileSync('scripts/build-media-runtime.sh', 'utf8');

    assert.match(source, /--enable-vaapi/u);
    assert.match(source, /--enable-libdrm/u);
    assert.match(source, /--pkg-config-flags=--static/u);
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
        hardwareAccelerators: target === 'darwin-arm64' ? ['videoToolbox'] : ['vaapi'],
        decoders: ['h264', 'hevc', 'av1', 'vp8', 'vp9', 'aac', 'mp3', 'flac', 'dts'],
        encoders: target === 'darwin-arm64' ? ['h264VideoToolbox', 'aac'] : ['h264Vaapi', 'aac'],
        filters:
          target === 'darwin-arm64'
            ? ['alimiter', 'loudnorm', 'ebur128', 'scaleVt']
            : ['alimiter', 'loudnorm', 'ebur128', 'scaleVaapi', 'tonemapVaapi'],
      },
    })}\n`,
  );
  return root;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
