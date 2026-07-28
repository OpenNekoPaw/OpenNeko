import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { MediaRuntimeQualification } from '../contracts';
import {
  NodeFfmpegProcess,
  type FfmpegExecutablePaths,
  type FfmpegProcessPort,
} from './NodeFfmpegProcess';
import { NodeMediaRuntime } from './NodeMediaRuntime';

export const MEDIA_RUNTIME_DESCRIPTOR_SCHEMA = 'openneko.media-runtime.v2';

export type MediaRuntimeTarget = 'darwin-arm64' | 'linux-x64';

export interface MediaRuntimeDescriptor {
  readonly schemaVersion: typeof MEDIA_RUNTIME_DESCRIPTOR_SCHEMA;
  readonly target: MediaRuntimeTarget;
  readonly ffmpegVersion: string;
  readonly ffprobeVersion: string;
  readonly license: {
    readonly spdx: string;
    readonly file: string;
    readonly sha256: string;
  };
  readonly executables: {
    readonly ffmpeg: { readonly file: string; readonly sha256: string };
    readonly ffprobe: { readonly file: string; readonly sha256: string };
  };
  readonly requiredCapabilities: {
    readonly hardwareAccelerators: readonly (keyof MediaRuntimeQualification['hardwareAccelerators'])[];
    readonly decoders: readonly (keyof MediaRuntimeQualification['decoders'])[];
    readonly encoders: readonly (keyof MediaRuntimeQualification['encoders'])[];
    readonly filters: readonly (keyof MediaRuntimeQualification['filters'])[];
  };
}

export interface VerifiedMediaRuntime {
  readonly descriptor: MediaRuntimeDescriptor;
  readonly executables: FfmpegExecutablePaths;
  readonly qualification: MediaRuntimeQualification;
}

const DECODER_CAPABILITIES = [
  'h264',
  'hevc',
  'av1',
  'vp8',
  'vp9',
  'aac',
  'mp3',
  'flac',
  'dts',
] as const;
const HARDWARE_ACCELERATOR_CAPABILITIES = ['videoToolbox', 'vaapi'] as const;
const ENCODER_CAPABILITIES = ['h264', 'h264VideoToolbox', 'h264Vaapi', 'aac'] as const;
const FILTER_CAPABILITIES = [
  'zscale',
  'tonemap',
  'sidedata',
  'alimiter',
  'loudnorm',
  'ebur128',
  'scaleVt',
  'scaleVaapi',
  'tonemapVaapi',
] as const;

export async function verifyMediaRuntimeDirectory(
  runtimeRoot: string,
  expectedTarget: MediaRuntimeTarget,
  options: { readonly process?: FfmpegProcessPort } = {},
): Promise<VerifiedMediaRuntime> {
  const canonicalRoot = await realpath(runtimeRoot);
  const descriptor = parseMediaRuntimeDescriptor(
    JSON.parse(await readFile(resolve(canonicalRoot, 'descriptor.json'), 'utf8')),
  );
  if (descriptor.target !== expectedTarget) {
    throw new Error(
      `Media runtime target mismatch: expected ${expectedTarget}, received ${descriptor.target}.`,
    );
  }
  const ffmpeg = await verifyFile(
    canonicalRoot,
    descriptor.executables.ffmpeg.file,
    descriptor.executables.ffmpeg.sha256,
  );
  const ffprobe = await verifyFile(
    canonicalRoot,
    descriptor.executables.ffprobe.file,
    descriptor.executables.ffprobe.sha256,
  );
  await verifyFile(canonicalRoot, descriptor.license.file, descriptor.license.sha256);
  const process = options.process ?? new NodeFfmpegProcess({ ffmpeg, ffprobe });
  const runtime = new NodeMediaRuntime({ process });
  try {
    const qualification = await runtime.qualify();
    if (!qualification.ffmpegVersion.includes(descriptor.ffmpegVersion)) {
      throw new Error(
        `Media runtime FFmpeg version mismatch: expected ${descriptor.ffmpegVersion}, received ${qualification.ffmpegVersion}.`,
      );
    }
    if (!qualification.ffprobeVersion.includes(descriptor.ffprobeVersion)) {
      throw new Error(
        `Media runtime ffprobe version mismatch: expected ${descriptor.ffprobeVersion}, received ${qualification.ffprobeVersion}.`,
      );
    }
    assertRequiredCapabilities(descriptor, qualification);
    return Object.freeze({
      descriptor,
      executables: Object.freeze({ ffmpeg, ffprobe }),
      qualification,
    });
  } finally {
    await runtime.dispose();
  }
}

function parseMediaRuntimeDescriptor(value: unknown): MediaRuntimeDescriptor {
  if (!isRecord(value) || value['schemaVersion'] !== MEDIA_RUNTIME_DESCRIPTOR_SCHEMA) {
    throw new Error('Media runtime descriptor schema is invalid.');
  }
  const target = value['target'];
  if (target !== 'darwin-arm64' && target !== 'linux-x64') {
    throw new Error('Media runtime descriptor fields are invalid.');
  }
  const ffmpegVersion = readRequiredString(value, 'ffmpegVersion');
  const ffprobeVersion = readRequiredString(value, 'ffprobeVersion');
  const licenseValue = readRequiredRecord(value, 'license');
  const executables = readRequiredRecord(value, 'executables');
  const required = readRequiredRecord(value, 'requiredCapabilities');
  const licenseFile = parseFileDescriptor(licenseValue);
  const requiredCapabilities = Object.freeze({
    hardwareAccelerators: readCapabilities(
      required,
      'hardwareAccelerators',
      HARDWARE_ACCELERATOR_CAPABILITIES,
    ),
    decoders: readCapabilities(required, 'decoders', DECODER_CAPABILITIES),
    encoders: readCapabilities(required, 'encoders', ENCODER_CAPABILITIES),
    filters: readCapabilities(required, 'filters', FILTER_CAPABILITIES),
  });
  assertCapabilityFloor(target, requiredCapabilities);
  return Object.freeze({
    schemaVersion: MEDIA_RUNTIME_DESCRIPTOR_SCHEMA,
    target,
    ffmpegVersion,
    ffprobeVersion,
    license: Object.freeze({
      spdx: readRequiredString(licenseValue, 'spdx'),
      ...licenseFile,
    }),
    executables: Object.freeze({
      ffmpeg: Object.freeze(parseFileDescriptor(readRequiredRecord(executables, 'ffmpeg'))),
      ffprobe: Object.freeze(parseFileDescriptor(readRequiredRecord(executables, 'ffprobe'))),
    }),
    requiredCapabilities,
  });
}

async function verifyFile(root: string, file: string, expectedSha256: string): Promise<string> {
  const path = resolve(root, file);
  const canonicalPath = await realpath(path);
  const relativePath = relative(root, canonicalPath);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Media runtime file escapes its root: ${file}.`);
  }
  const digest = createHash('sha256')
    .update(await readFile(canonicalPath))
    .digest('hex');
  if (digest !== expectedSha256) {
    throw new Error(`Media runtime checksum mismatch for ${file}.`);
  }
  return canonicalPath;
}

function assertRequiredCapabilities(
  descriptor: MediaRuntimeDescriptor,
  qualification: MediaRuntimeQualification,
): void {
  for (const capability of descriptor.requiredCapabilities.hardwareAccelerators) {
    if (!qualification.hardwareAccelerators[capability]) {
      missingCapability('hardwareAccelerators', capability);
    }
  }
  for (const capability of descriptor.requiredCapabilities.decoders) {
    if (!qualification.decoders[capability]) missingCapability('decoders', capability);
  }
  for (const capability of descriptor.requiredCapabilities.encoders) {
    if (!qualification.encoders[capability]) missingCapability('encoders', capability);
  }
  for (const capability of descriptor.requiredCapabilities.filters) {
    if (!qualification.filters[capability]) missingCapability('filters', capability);
  }
}

function assertCapabilityFloor(
  target: MediaRuntimeTarget,
  capabilities: MediaRuntimeDescriptor['requiredCapabilities'],
): void {
  const required = {
    hardwareAccelerators:
      target === 'darwin-arm64' ? (['videoToolbox'] as const) : (['vaapi'] as const),
    decoders: DECODER_CAPABILITIES,
    encoders:
      target === 'darwin-arm64'
        ? (['h264VideoToolbox', 'aac'] as const)
        : (['h264Vaapi', 'aac'] as const),
    filters:
      target === 'darwin-arm64'
        ? (['alimiter', 'loudnorm', 'ebur128', 'scaleVt'] as const)
        : (['alimiter', 'loudnorm', 'ebur128', 'scaleVaapi', 'tonemapVaapi'] as const),
  };
  for (const section of ['hardwareAccelerators', 'decoders', 'encoders', 'filters'] as const) {
    for (const capability of required[section]) {
      if (!includesCapability(capabilities[section], capability)) {
        throw new Error(
          `Media runtime descriptor weakens required ${section} capability ${capability}.`,
        );
      }
    }
  }
}

function includesCapability(capabilities: readonly string[], capability: string): boolean {
  return capabilities.includes(capability);
}

function missingCapability(section: string, capability: string): never {
  throw new Error(`Media runtime is missing required ${section} capability ${capability}.`);
}

function parseFileDescriptor(value: Readonly<Record<string, unknown>>): {
  readonly file: string;
  readonly sha256: string;
} {
  const file = value['file'];
  const sha256 = value['sha256'];
  if (!isSafeRelativePath(file) || !isSha256(sha256)) {
    throw new Error('Media runtime file descriptor is invalid.');
  }
  return { file, sha256 };
}

function readCapabilities<const TCapability extends string>(
  value: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly TCapability[],
): readonly TCapability[] {
  const capabilities = value[key];
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    throw new Error(`Media runtime ${key} capability signature is empty.`);
  }
  const parsed: TCapability[] = [];
  for (const capability of capabilities) {
    if (!isNonEmptyString(capability) || !isAllowedCapability(capability, allowed)) {
      throw new Error(`Media runtime ${key} capability ${String(capability)} is unknown.`);
    }
    parsed.push(capability);
  }
  return Object.freeze(parsed);
}

function isAllowedCapability<TCapability extends string>(
  value: string,
  allowed: readonly TCapability[],
): value is TCapability {
  return allowed.some((capability) => capability === value);
}

function readRequiredRecord(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const item = value[key];
  if (!isRecord(item)) throw new Error(`Media runtime descriptor ${key} must be an object.`);
  return item;
}

function readRequiredString(value: Readonly<Record<string, unknown>>, key: string): string {
  const item = value[key];
  if (!isNonEmptyString(item)) throw new Error(`Media runtime descriptor ${key} is invalid.`);
  return item;
}

function isSafeRelativePath(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !isAbsolute(value) &&
    !value.includes('\\') &&
    !value.split('/').includes('..')
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
