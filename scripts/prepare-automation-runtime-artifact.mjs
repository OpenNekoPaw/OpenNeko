#!/usr/bin/env node

import { resolve } from 'node:path';
import { buildCuaDriverArtifactCandidate } from './automation-runtime-artifact-builder.mjs';

const options = parseArguments(process.argv.slice(2));
const receipt = await buildCuaDriverArtifactCandidate(options);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);

function parseArguments(argv) {
  const value = (name) => {
    const index = argv.indexOf(name);
    const candidate = index >= 0 ? argv[index + 1] : undefined;
    if (!candidate) throw new Error(`Missing required argument ${name}.`);
    return candidate;
  };
  const extensionId = value('--extension');
  if (extensionId !== 'computer-use') {
    throw new Error(`Automation runtime artifact building is unavailable for '${extensionId}'.`);
  }
  return Object.freeze({
    target: value('--target'),
    upstreamArchivePath: resolve(value('--upstream-archive')),
    nodeRuntimePath: resolve(value('--node-runtime')),
    nodeRuntimeReceiptPath: resolve(value('--node-runtime-receipt')),
    licenseInventoryPath: resolve(value('--license-inventory')),
    outputPath: resolve(value('--output')),
  });
}
