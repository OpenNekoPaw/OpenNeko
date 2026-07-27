#!/usr/bin/env node

import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assertRuntimeDirectory,
  createMediaRuntimeDescriptor,
} from './media-runtime-closure.mjs';

const options = parseArguments(process.argv.slice(2));
const output = resolve(options.output);
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, 'bin'), { recursive: true });
cpSync(options.ffmpeg, join(output, 'bin', 'ffmpeg'));
cpSync(options.ffprobe, join(output, 'bin', 'ffprobe'));
cpSync(options.license, join(output, 'COPYING'));
chmodSync(join(output, 'bin', 'ffmpeg'), 0o755);
chmodSync(join(output, 'bin', 'ffprobe'), 0o755);
const descriptor = createMediaRuntimeDescriptor({
  target: options.target,
  ffmpeg: join(output, 'bin', 'ffmpeg'),
  ffprobe: join(output, 'bin', 'ffprobe'),
  license: join(output, 'COPYING'),
  spdx: options.spdx,
});
writeFileSync(
  join(output, 'descriptor.json'),
  `${JSON.stringify(descriptor, null, 2)}\n`,
  'utf8',
);
assertRuntimeDirectory(output, options.target, { qualify: true });
process.stdout.write(`Prepared verified media runtime at ${output}.\n`);

function parseArguments(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    const candidate = index >= 0 ? argv[index + 1] : undefined;
    if (!candidate) throw new Error(`Missing required argument ${name}.`);
    return candidate;
  };
  const target = value('--target');
  if (target !== 'darwin-arm64' && target !== 'linux-x64') {
    throw new Error(`Unsupported media runtime target: ${target}.`);
  }
  return Object.freeze({
    target,
    ffmpeg: resolve(value('--ffmpeg')),
    ffprobe: resolve(value('--ffprobe')),
    license: resolve(value('--license')),
    spdx: value('--spdx'),
    output: value('--output'),
  });
}
