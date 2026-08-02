#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const root = process.cwd();
const manifest = JSON.parse(await readFile(`${root}/packages/neko-shared/package.json`, 'utf8'));
const ledger = JSON.parse(
  await readFile(`${root}/quality/ledgers/neko-shared-public-surface.json`, 'utf8'),
);
const findings = [];

if (ledger.version !== 1 || ledger.package !== '@neko/shared') {
  findings.push('Shared public surface ledger must use version 1 for @neko/shared');
}
const retained = new Set(ledger.targetRetainedEntries ?? []);
const migrations = new Map((ledger.migrations ?? []).map((entry) => [entry.entry, entry]));
const expected = new Set([...retained, ...migrations.keys()]);
const actual = new Set(Object.keys(manifest.exports ?? {}));
for (const entry of actual) {
  if (entry.includes('*')) findings.push(`Shared wildcard export is forbidden: ${entry}`);
  if (!expected.has(entry))
    findings.push(`Shared export is missing from migration ledger: ${entry}`);
}
for (const entry of expected) {
  if (!actual.has(entry)) findings.push(`Shared ledger contains stale current entry: ${entry}`);
}
for (const migration of migrations.values()) {
  for (const key of ['target', 'owner', 'removalTask']) {
    if (typeof migration[key] !== 'string' || migration[key].length === 0) {
      findings.push(`Shared migration ${migration.entry} requires ${key}`);
    }
  }
}
for (const removed of ledger.removedEntries ?? []) {
  if (actual.has(removed.entry))
    findings.push(`Removed Shared entry is public again: ${removed.entry}`);
}

if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ status: 'failed', findings }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({ status: 'passed', retained: retained.size, migrating: migrations.size }, null, 2)}\n`,
  );
}
