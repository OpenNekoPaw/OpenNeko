import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const MEDIA_RUNTIME_DESCRIPTOR_SCHEMA = 'openneko.media-runtime.v2';

const COMMON_REQUIRED = Object.freeze({
  decoders: Object.freeze(['h264', 'hevc', 'av1', 'vp8', 'vp9', 'aac', 'mp3', 'flac', 'dts']),
  encoders: Object.freeze(['aac']),
  filters: Object.freeze(['alimiter', 'loudnorm', 'ebur128']),
});
const CAPABILITY_SECTIONS = Object.freeze([
  'hardwareAccelerators',
  'decoders',
  'encoders',
  'filters',
]);

export function stageDevelopmentMediaRuntime(stageRoot, target, environment = process.env) {
  const ffmpeg = environment.NEKO_FFMPEG_PATH?.trim();
  const ffprobe = environment.NEKO_FFPROBE_PATH?.trim();
  if (!ffmpeg || !ffprobe) {
    throw new Error(
      'Development media runtime requires explicit NEKO_FFMPEG_PATH and NEKO_FFPROBE_PATH.',
    );
  }
  const license =
    environment.NEKO_FFMPEG_LICENSE_PATH?.trim() || discoverDevelopmentLicense(ffmpeg);
  const spdx = environment.NEKO_FFMPEG_LICENSE_SPDX?.trim() || 'GPL-3.0-or-later';
  const ffmpegSource = realpathSync(ffmpeg);
  const ffprobeSource = realpathSync(ffprobe);
  const licenseSource = realpathSync(license);
  const licenseFileName = basename(licenseSource);
  const runtimeRoot = join(stageRoot, 'dist', 'media-runtime', target);
  mkdirSync(join(runtimeRoot, 'bin'), { recursive: true });
  copyResolvedDevelopmentFile(ffmpegSource, join(runtimeRoot, 'bin', 'ffmpeg'));
  copyResolvedDevelopmentFile(ffprobeSource, join(runtimeRoot, 'bin', 'ffprobe'));
  copyResolvedDevelopmentFile(licenseSource, join(runtimeRoot, licenseFileName));
  chmodSync(join(runtimeRoot, 'bin', 'ffmpeg'), 0o755);
  chmodSync(join(runtimeRoot, 'bin', 'ffprobe'), 0o755);
  const descriptor = createMediaRuntimeDescriptor({
    target,
    ffmpeg: join(runtimeRoot, 'bin', 'ffmpeg'),
    ffprobe: join(runtimeRoot, 'bin', 'ffprobe'),
    license: join(runtimeRoot, licenseFileName),
    spdx,
  });
  writeFileSync(
    join(runtimeRoot, 'descriptor.json'),
    `${JSON.stringify(descriptor, null, 2)}\n`,
    'utf8',
  );
  assertStagedMediaRuntime(stageRoot, target, { qualify: true });
  return Object.freeze({ runtimeRoot, descriptor });
}

export function copyResolvedDevelopmentFile(source, destination) {
  cpSync(realpathSync(source), destination);
}

export function stagePackagedMediaRuntime(stageRoot, target, runtimeSourceRoot) {
  if (!runtimeSourceRoot) {
    throw new Error(
      `OpenNeko ${target} packaging requires NEKO_MEDIA_RUNTIME_ROOT with a verified runtime bundle.`,
    );
  }
  const source = realpathSync(runtimeSourceRoot);
  assertRuntimeDirectory(source, target, { qualify: true });
  const destination = join(stageRoot, 'dist', 'media-runtime', target);
  cpSync(source, destination, { recursive: true });
  assertStagedMediaRuntime(stageRoot, target, { qualify: true });
  return Object.freeze({ runtimeRoot: destination });
}

export function assertStagedMediaRuntime(stageRoot, target, options = {}) {
  return assertRuntimeDirectory(join(stageRoot, 'dist', 'media-runtime', target), target, options);
}

export function assertRuntimeDirectory(runtimeRoot, target, options = {}) {
  const root = realpathSync(runtimeRoot);
  const descriptorPath = join(root, 'descriptor.json');
  if (!existsSync(descriptorPath)) {
    throw new Error(`Media runtime descriptor is missing: ${descriptorPath}.`);
  }
  const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
  assertDescriptor(descriptor, target);
  const ffmpeg = assertRuntimeFile(root, descriptor.executables.ffmpeg);
  const ffprobe = assertRuntimeFile(root, descriptor.executables.ffprobe);
  assertRuntimeFile(root, descriptor.license);
  if (options.qualify) {
    const actual = inspectCapabilities(ffmpeg, ffprobe);
    if (!actual.ffmpegVersion.includes(descriptor.ffmpegVersion)) {
      throw new Error(
        `Media runtime FFmpeg version mismatch: expected ${descriptor.ffmpegVersion}, received ${actual.ffmpegVersion}.`,
      );
    }
    if (!actual.ffprobeVersion.includes(descriptor.ffprobeVersion)) {
      throw new Error(
        `Media runtime ffprobe version mismatch: expected ${descriptor.ffprobeVersion}, received ${actual.ffprobeVersion}.`,
      );
    }
    for (const section of CAPABILITY_SECTIONS) {
      for (const capability of descriptor.requiredCapabilities[section]) {
        if (!actual[section].has(capability)) {
          throw new Error(`Media runtime is missing required ${section} capability ${capability}.`);
        }
      }
    }
  }
  return Object.freeze({ descriptor, ffmpeg, ffprobe });
}

export function createMediaRuntimeDescriptor({
  target,
  ffmpeg,
  ffprobe,
  license,
  spdx = 'GPL-3.0-or-later',
}) {
  const capabilities = inspectCapabilities(ffmpeg, ffprobe);
  const requiredCapabilities = requiredCapabilitiesForTarget(target);
  for (const section of CAPABILITY_SECTIONS) {
    for (const capability of requiredCapabilities[section]) {
      if (!capabilities[section].has(capability)) {
        throw new Error(`Media runtime is missing required ${section} capability ${capability}.`);
      }
    }
  }
  return Object.freeze({
    schemaVersion: MEDIA_RUNTIME_DESCRIPTOR_SCHEMA,
    target,
    ffmpegVersion: readFfmpegVersion(capabilities.ffmpegVersion),
    ffprobeVersion: readFfprobeVersion(capabilities.ffprobeVersion),
    license: Object.freeze({
      spdx,
      file: basename(license),
      sha256: sha256File(license),
    }),
    executables: Object.freeze({
      ffmpeg: Object.freeze({ file: 'bin/ffmpeg', sha256: sha256File(ffmpeg) }),
      ffprobe: Object.freeze({ file: 'bin/ffprobe', sha256: sha256File(ffprobe) }),
    }),
    requiredCapabilities,
  });
}

function inspectCapabilities(ffmpeg, ffprobe) {
  const ffmpegVersion = run(ffmpeg, ['-hide_banner', '-version']);
  const ffprobeVersion = run(ffprobe, ['-hide_banner', '-version']);
  const hardwareAcceleratorText = run(ffmpeg, ['-hide_banner', '-hwaccels']);
  const decoderText = run(ffmpeg, ['-hide_banner', '-decoders']);
  const encoderText = run(ffmpeg, ['-hide_banner', '-encoders']);
  const filterText = run(ffmpeg, ['-hide_banner', '-filters']);
  return Object.freeze({
    ffmpegVersion: ffmpegVersion.split(/\r?\n/u)[0] ?? '',
    ffprobeVersion: ffprobeVersion.split(/\r?\n/u)[0] ?? '',
    hardwareAccelerators: capabilitySet(hardwareAcceleratorText, {
      videoToolbox: 'videotoolbox',
      vaapi: 'vaapi',
    }),
    decoders: capabilitySet(decoderText, {
      h264: 'h264',
      hevc: 'hevc',
      av1: 'av1',
      vp8: 'vp8',
      vp9: 'vp9',
      aac: 'aac',
      mp3: 'mp3',
      flac: 'flac',
      dts: 'dca',
    }),
    encoders: capabilitySet(encoderText, {
      h264: 'h264',
      h264VideoToolbox: 'h264_videotoolbox',
      h264Vaapi: 'h264_vaapi',
      aac: 'aac',
    }),
    filters: capabilitySet(filterText, {
      alimiter: 'alimiter',
      loudnorm: 'loudnorm',
      ebur128: 'ebur128',
      scaleVt: 'scale_vt',
      scaleVaapi: 'scale_vaapi',
      tonemapVaapi: 'tonemap_vaapi',
    }),
  });
}

function requiredCapabilitiesForTarget(target) {
  if (target !== 'darwin-arm64' && target !== 'linux-x64') {
    throw new Error(`Unsupported media runtime target: ${target}.`);
  }
  return Object.freeze({
    hardwareAccelerators: Object.freeze([target === 'darwin-arm64' ? 'videoToolbox' : 'vaapi']),
    decoders: COMMON_REQUIRED.decoders,
    encoders: Object.freeze([
      ...COMMON_REQUIRED.encoders,
      ...(target === 'darwin-arm64' ? ['h264VideoToolbox'] : ['h264Vaapi']),
    ]),
    filters: Object.freeze([
      ...COMMON_REQUIRED.filters,
      ...(target === 'darwin-arm64' ? ['scaleVt'] : ['scaleVaapi', 'tonemapVaapi']),
    ]),
  });
}

function assertDescriptor(descriptor, target) {
  if (
    !descriptor ||
    descriptor.schemaVersion !== MEDIA_RUNTIME_DESCRIPTOR_SCHEMA ||
    descriptor.target !== target ||
    typeof descriptor.ffmpegVersion !== 'string' ||
    typeof descriptor.ffprobeVersion !== 'string' ||
    !descriptor.executables ||
    !descriptor.license ||
    !descriptor.requiredCapabilities
  ) {
    throw new Error(`Media runtime descriptor is invalid for ${target}.`);
  }
  const required = requiredCapabilitiesForTarget(target);
  for (const section of CAPABILITY_SECTIONS) {
    if (!Array.isArray(descriptor.requiredCapabilities[section])) {
      throw new Error(`Media runtime descriptor ${section} capability signature is invalid.`);
    }
    for (const capability of required[section]) {
      if (!descriptor.requiredCapabilities[section].includes(capability)) {
        throw new Error(
          `Media runtime descriptor weakens required ${section} capability ${capability}.`,
        );
      }
    }
  }
}

function assertRuntimeFile(root, entry) {
  if (
    !entry ||
    typeof entry.file !== 'string' ||
    isAbsolute(entry.file) ||
    entry.file.includes('\\') ||
    entry.file.split('/').includes('..') ||
    !/^[a-f0-9]{64}$/u.test(entry.sha256)
  ) {
    throw new Error('Media runtime file descriptor is invalid.');
  }
  const path = realpathSync(join(root, entry.file));
  const relativePath = relative(root, path);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Media runtime file escapes its root: ${entry.file}.`);
  }
  if (sha256File(path) !== entry.sha256) {
    throw new Error(`Media runtime checksum mismatch for ${entry.file}.`);
  }
  return path;
}

function capabilitySet(output, mapping) {
  return new Set(
    Object.entries(mapping)
      .filter(([, ffmpegName]) =>
        new RegExp(`(?:^|\\n)[^\\n]*\\b${escapeRegExp(ffmpegName)}\\b`, 'u').test(output),
      )
      .map(([name]) => name),
  );
}

function readFfmpegVersion(line) {
  const match = /^ffmpeg version (\S+)/u.exec(line);
  if (!match?.[1]) throw new Error(`Cannot parse FFmpeg version from: ${line}.`);
  return match[1];
}

function readFfprobeVersion(line) {
  const match = /^ffprobe version (\S+)/u.exec(line);
  if (!match?.[1]) throw new Error(`Cannot parse ffprobe version from: ${line}.`);
  return match[1];
}

function run(executable, args) {
  return execFileSync(executable, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function discoverDevelopmentLicense(ffmpegPath) {
  const prefix = resolve(dirname(ffmpegPath), '..');
  for (const fileName of ['COPYING.GPLv3', 'LICENSE.md', 'LICENSE']) {
    const candidate = join(prefix, fileName);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Development FFmpeg license was not found. Set NEKO_FFMPEG_LICENSE_PATH explicitly.',
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
