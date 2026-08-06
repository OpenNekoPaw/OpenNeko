#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const root = process.cwd();
const manifest = JSON.parse(await readFile(`${root}/packages/shared/package.json`, 'utf8'));
const ledger = JSON.parse(
  await readFile(`${root}/quality/ledgers/neko-shared-public-surface.json`, 'utf8'),
);
const findings = [];

if (
  Object.keys(ledger).sort().join('\0') !==
    ['entries', 'package'].sort().join('\0') ||
  ledger.package !== '@neko/shared'
) {
  findings.push('Shared public surface ledger must use the canonical @neko/shared shape');
}
const expected = new Set(ledger.entries ?? []);
const actual = new Set(Object.keys(manifest.exports ?? {}));
for (const entry of actual) {
  if (entry.includes('*')) findings.push(`Shared wildcard export is forbidden: ${entry}`);
  if (!expected.has(entry))
    findings.push(`Shared export is missing from the canonical retained-entry ledger: ${entry}`);
}
for (const entry of expected) {
  if (!actual.has(entry)) findings.push(`Shared ledger contains stale current entry: ${entry}`);
}
if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ status: 'failed', findings }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({ status: 'passed', entries: expected.size }, null, 2)}\n`,
  );
}
