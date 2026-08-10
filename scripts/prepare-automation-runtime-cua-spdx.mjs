#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCuaDriverSpdxCandidate } from './automation-runtime-cua-spdx-builder.mjs';

const options = parseArguments(process.argv.slice(2));
const receipt = buildCuaDriverSpdxCandidate(options);
writeFileSync(options.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o644,
});
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

function parseArguments(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    const candidate = index >= 0 ? argv[index + 1] : undefined;
    if (!candidate) throw new Error(`Missing required argument ${name}.`);
    return resolve(candidate);
  };
  return Object.freeze({
    target: 'darwin-arm64',
    cuaSourceRoot: value('--cua-source'),
    ubrnSourceRoot: value('--ubrn-source'),
    outputPath: value('--output'),
    receiptPath: value('--receipt-output'),
  });
}
