#!/usr/bin/env tsx

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listNekoStorageClassifications,
  type NekoStorageClassification,
} from '../packages/local-metadata/src/storage.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface NonCanonicalDatabasePath {
  readonly sourcePath: string;
  readonly literal: string;
}

const retiredPiTables = [
  'agent_conversation_records',
  'conversations',
  'pi_conversations',
  'pi_messages',
] as const;

export function validateRetiredAgentStorageSources(
  sources: Readonly<Record<string, string>>,
): readonly string[] {
  const findings: string[] = [];
  for (const [sourcePath, source] of Object.entries(sources)) {
    const dropsDynamicTable = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?\$\{/iu.test(source);
    for (const table of retiredPiTables) {
      const namesRetiredTable = new RegExp(`['"]${table}['"]`, 'u').test(source);
      if (
        new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${table}\\b`, 'iu').test(source) ||
        (dropsDynamicTable && namesRetiredTable)
      ) {
        findings.push(`${sourcePath}: retired Pi table ${table} must remain byte-preserved`);
      }
    }
    if (/\b(?:ConversationCatalogRepository|ConversationCatalogSource)\b/u.test(source)) {
      findings.push(`${sourcePath}: retired generic Conversation SQLite catalog contract`);
    }
    if (/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?conversations\b/iu.test(source)) {
      findings.push(`${sourcePath}: retired generic Conversation SQLite catalog table`);
    }
    if (/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?agent_conversation_records\b/iu.test(source)) {
      findings.push(`${sourcePath}: retired first-submit Agent Conversation SQLite table`);
    }
    if (
      /\b(?:AgentConversationLifecycleService|AgentConversationLifecycleRepository|AgentDomainConversationService)\b/u.test(
        source,
      )
    ) {
      findings.push(`${sourcePath}: retired first-submit Agent Conversation lifecycle contract`);
    }
    if (
      source.includes("'conversation-journals'") ||
      /join\(root,\s*['"](?:journals|conversations)['"]\)/u.test(source)
    ) {
      findings.push(`${sourcePath}: retired Pi conversation file layout`);
    }
    if (
      /\b(?:removeRetiredPiStorage|RetiredPiStorageFilePort|DesktopRetiredPiStorageFilePort)\b/u.test(
        source,
      )
    ) {
      findings.push(`${sourcePath}: retired Pi storage cleanup path must remain deleted`);
    }
  }
  return findings;
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

export function reportNonCanonicalDatabasePaths(
  paths: readonly NonCanonicalDatabasePath[],
): readonly string[] {
  return paths.map(
    ({ sourcePath, literal }) => `Non-canonical SQLite path: ${sourcePath} -> ${literal}`,
  );
}

export async function inspectStorageAuthorities(root = repositoryRoot) {
  const sourceFiles = await discoverProductionSources(root);
  const nonCanonicalDatabasePaths: NonCanonicalDatabasePath[] = [];
  const sourceFindings: string[] = [];
  const sources: Record<string, string> = {};
  for (const sourcePath of sourceFiles) {
    const source = await readFile(path.join(root, sourcePath), 'utf8');
    sources[sourcePath] = source;
    for (const literal of extractDatabaseLiterals(source)) {
      if (
        literal === 'neko.db' ||
        literal === '~/.neko/neko.db' ||
        literal === '.sqlite' ||
        literal === '.db'
      )
        continue;
      nonCanonicalDatabasePaths.push({ sourcePath, literal });
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
    ...reportNonCanonicalDatabasePaths(nonCanonicalDatabasePaths),
    ...validateRetiredAgentStorageSources(sources),
    ...sourceFindings,
  ];
  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    classifications: listNekoStorageClassifications().length,
    checkedSources: sourceFiles.length,
    nonCanonicalDatabasePaths: nonCanonicalDatabasePaths.length,
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
