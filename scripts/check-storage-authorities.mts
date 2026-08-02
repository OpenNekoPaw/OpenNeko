#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listNekoStorageClassifications,
  type NekoStorageClassification,
} from '../packages/local-metadata/src/storage.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configurationPath = 'quality/storage-authority-sources.json';

interface LegacyReaderDeclaration {
  readonly sourcePath: string;
  readonly legacyLiteral: string;
  readonly owner: string;
  readonly reason: string;
  readonly replacement: string;
  readonly validationPath: string;
  readonly removalCondition: string;
  readonly expiresOn: string;
}

interface StorageAuthorityConfiguration {
  readonly version: 1;
  readonly legacyReaders: readonly LegacyReaderDeclaration[];
}

interface ObservedLegacyReader {
  readonly sourcePath: string;
  readonly legacyLiteral: string;
}

export function validateStorageClassifications(
  classifications: readonly NekoStorageClassification[],
): readonly string[] {
  const findings: string[] = [];
  const ids = new Set<string>();
  for (const classification of classifications) {
    if (ids.has(classification.id))
      findings.push(`Duplicate storage classification: ${classification.id}`);
    ids.add(classification.id);
    if (
      classification.sensitivity === 'secret' &&
      classification.authorityKind !== 'secret-store'
    ) {
      findings.push(`${classification.id}: secrets require secret-store authority`);
    }
    if (classification.storageClass === 'raw-log' && classification.authorityKind !== 'log-file') {
      findings.push(`${classification.id}: raw logs require log-file authority`);
    }
    if (
      (classification.userManagement === 'user-content' ||
        classification.portability !== 'machine-local') &&
      classification.sqliteRole !== 'prohibited'
    ) {
      findings.push(
        `${classification.id}: user-managed or portable content cannot use SQLite authority`,
      );
    }
    if (
      classification.authorityKind === 'sqlite-state' &&
      classification.sqliteRole !== 'authority'
    ) {
      findings.push(`${classification.id}: sqlite-state must be authoritative`);
    }
    if (
      classification.authorityKind === 'sqlite-cache' &&
      classification.sqliteRole !== 'projection'
    ) {
      findings.push(`${classification.id}: sqlite-cache must be a rebuildable projection`);
    }
    if (
      !classification.authorityKind.startsWith('sqlite-') &&
      classification.sqliteRole !== 'prohibited'
    ) {
      findings.push(
        `${classification.id}: non-SQLite authority must prohibit SQLite representation`,
      );
    }
  }
  return findings;
}

export function reconcileLegacyReaders(
  observed: readonly ObservedLegacyReader[],
  configuration: StorageAuthorityConfiguration,
  options: { readonly now: number; readonly pathExists: (value: string) => boolean },
): readonly string[] {
  const findings: string[] = [];
  if (configuration.version !== 1)
    findings.push('storage authority configuration version must equal 1');
  const declared = new Map<string, LegacyReaderDeclaration>();
  for (const [index, entry] of configuration.legacyReaders.entries()) {
    const label = `legacyReaders[${index}]`;
    const key = legacyKey(entry);
    if (declared.has(key)) findings.push(`${label}: duplicate legacy reader declaration ${key}`);
    declared.set(key, entry);
    for (const field of [
      'sourcePath',
      'legacyLiteral',
      'owner',
      'reason',
      'replacement',
      'validationPath',
      'removalCondition',
      'expiresOn',
    ] as const) {
      if (entry[field].trim().length === 0) findings.push(`${label}.${field} must be non-empty`);
    }
    if (Date.parse(`${entry.expiresOn}T23:59:59Z`) < options.now) {
      findings.push(`${label}.expiresOn has expired: ${entry.expiresOn}`);
    }
    if (!options.pathExists(entry.sourcePath)) findings.push(`${label}.sourcePath does not exist`);
    if (!options.pathExists(entry.validationPath))
      findings.push(`${label}.validationPath does not exist`);
  }

  const observedKeys = new Set(observed.map(legacyKey));
  for (const entry of observed) {
    if (!declared.has(legacyKey(entry))) {
      findings.push(
        `Unclassified non-canonical SQLite path: ${entry.sourcePath} -> ${entry.legacyLiteral}`,
      );
    }
  }
  for (const [key] of declared) {
    if (!observedKeys.has(key)) findings.push(`Stale legacy reader declaration: ${key}`);
  }
  return findings;
}

export async function inspectStorageAuthorities(root = repositoryRoot) {
  const configuration = JSON.parse(
    await readFile(path.join(root, configurationPath), 'utf8'),
  ) as StorageAuthorityConfiguration;
  const sourceFiles = await discoverProductionSources(root);
  const observedLegacyReaders: ObservedLegacyReader[] = [];
  const sourceFindings: string[] = [];
  for (const sourcePath of sourceFiles) {
    const source = await readFile(path.join(root, sourcePath), 'utf8');
    for (const literal of extractDatabaseLiterals(source)) {
      if (
        literal === 'neko.db' ||
        literal === '~/.neko/neko.db' ||
        literal === '.sqlite' ||
        literal === '.db'
      )
        continue;
      observedLegacyReaders.push({ sourcePath, legacyLiteral: literal });
    }
    if (/CREATE\s+TABLE[\s\S]{0,500}\b(?:credential|secret|token)s?\b/iu.test(source)) {
      sourceFindings.push(`${sourcePath}: ordinary SQLite schema contains a secret-like field`);
    }
    if (
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:raw_)?(?:logs?|journals?|transcripts?|audits?|events?)\b/iu.test(
        source,
      )
    ) {
      sourceFindings.push(`${sourcePath}: raw log/journal authority cannot be a SQLite table`);
    }
  }

  const findings = [
    ...validateStorageClassifications(listNekoStorageClassifications()),
    ...reconcileLegacyReaders(observedLegacyReaders, configuration, {
      now: Date.now(),
      pathExists: (value) => existsSync(path.join(root, value)),
    }),
    ...sourceFindings,
  ];
  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    configuration: configurationPath,
    classifications: listNekoStorageClassifications().length,
    checkedSources: sourceFiles.length,
    legacyReaders: observedLegacyReaders.length,
    findings,
  };
}

function extractDatabaseLiterals(source: string): readonly string[] {
  const literals = new Set<string>();
  for (const match of source.matchAll(/['"`]([^'"`\n]*(?:\.sqlite|\.db))['"`]/giu)) {
    const value = match[1];
    if (value) literals.add(value);
  }
  return [...literals];
}

async function discoverProductionSources(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const sourceRoot of ['apps', 'packages']) {
    await walk(path.join(root, sourceRoot), root, files);
  }
  return files.sort();
}

async function walk(directory: string, root: string, files: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        ['node_modules', 'dist', 'out', 'coverage', '.vite', '__tests__', 'fixtures'].includes(
          entry.name,
        )
      )
        continue;
      await walk(target, root, files);
    } else if (
      entry.isFile() &&
      /\.[cm]?[jt]sx?$/u.test(entry.name) &&
      !/\.(test|spec)\.[cm]?[jt]sx?$/u.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(path.relative(root, target).split(path.sep).join('/'));
    }
  }
}

function legacyKey(entry: Pick<LegacyReaderDeclaration, 'sourcePath' | 'legacyLiteral'>): string {
  return `${entry.sourcePath}\u0000${entry.legacyLiteral}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectStorageAuthorities();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
