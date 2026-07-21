#!/usr/bin/env node

import { readdirSync } from 'node:fs';

import { assertOpenNekoReleaseArtifacts } from './openneko-vsix-contract.mjs';
import { parseReleaseTag } from './validate-release-source.mjs';

function main() {
  const directory = process.env.RELEASE_ARTIFACT_DIRECTORY ?? 'release-artifacts';
  const release = parseReleaseTag(process.env.GITHUB_REF_NAME ?? '');
  const files = readdirSync(directory).filter((file) => file.endsWith('.vsix'));
  const result = assertOpenNekoReleaseArtifacts(files, release.manifestVersion);
  process.stdout.write(`Validated OpenNeko release artifacts: ${result.files.join(', ')}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
