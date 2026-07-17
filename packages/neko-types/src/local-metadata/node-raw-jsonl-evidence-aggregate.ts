import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline';

export type RawJsonlEvidenceKind = 'journal' | 'log';

export interface RawJsonlEvidenceSource {
  readonly kind: RawJsonlEvidenceKind;
  readonly root: string;
}

export interface RawJsonlEvidenceFileAggregate {
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly entryCount: number;
  readonly malformedLineCount: number;
  readonly firstTimestamp: number | null;
  readonly lastTimestamp: number | null;
  readonly categories: Readonly<Record<string, number>>;
}

export interface RawJsonlEvidenceAggregate {
  readonly kind: RawJsonlEvidenceKind;
  readonly root: string;
  readonly fileCount: number;
  readonly entryCount: number;
  readonly malformedLineCount: number;
  readonly firstTimestamp: number | null;
  readonly lastTimestamp: number | null;
  readonly categories: Readonly<Record<string, number>>;
  readonly files: readonly RawJsonlEvidenceFileAggregate[];
}

export interface RawJsonlEvidenceAggregateSink {
  replace(aggregates: readonly RawJsonlEvidenceAggregate[]): Promise<void>;
}

export interface ProjectRawJsonlEvidenceAggregatesOptions {
  readonly sources: readonly RawJsonlEvidenceSource[];
  readonly sink?: RawJsonlEvidenceAggregateSink;
}

export async function projectRawJsonlEvidenceAggregates(
  options: ProjectRawJsonlEvidenceAggregatesOptions,
): Promise<readonly RawJsonlEvidenceAggregate[]> {
  const aggregates = await Promise.all(options.sources.map(projectSourceAggregate));
  if (options.sink) await options.sink.replace(aggregates);
  return aggregates;
}

async function projectSourceAggregate(
  source: RawJsonlEvidenceSource,
): Promise<RawJsonlEvidenceAggregate> {
  const filePaths = await listJsonlFiles(source.root);
  const files = await Promise.all(
    filePaths.map((filePath) => projectFileAggregate(source.root, filePath)),
  );
  return {
    kind: source.kind,
    root: source.root,
    fileCount: files.length,
    entryCount: sum(files.map((file) => file.entryCount)),
    malformedLineCount: sum(files.map((file) => file.malformedLineCount)),
    firstTimestamp: minimumTimestamp(files.map((file) => file.firstTimestamp)),
    lastTimestamp: maximumTimestamp(files.map((file) => file.lastTimestamp)),
    categories: mergeCategoryCounts(files.map((file) => file.categories)),
    files,
  };
}

async function listJsonlFiles(root: string): Promise<readonly string[]> {
  const paths: string[] = [];
  await visit(root);
  return paths.sort((left, right) => left.localeCompare(right));

  async function visit(path: string): Promise<void> {
    let metadata;
    try {
      metadata = await lstat(path);
    } catch (error) {
      if (isErrorWithCode(error) && error.code === 'ENOENT') return;
      throw error;
    }
    if (metadata.isSymbolicLink()) return;
    if (!metadata.isDirectory()) {
      if (path.toLocaleLowerCase().endsWith('.jsonl')) paths.push(path);
      return;
    }
    for (const child of await readdir(path)) await visit(join(path, child));
  }
}

async function projectFileAggregate(
  root: string,
  filePath: string,
): Promise<RawJsonlEvidenceFileAggregate> {
  const metadata = await lstat(filePath);
  const categories: Record<string, number> = {};
  let entryCount = 0;
  let malformedLineCount = 0;
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      malformedLineCount += 1;
      continue;
    }
    if (!isRecord(value)) {
      malformedLineCount += 1;
      continue;
    }
    entryCount += 1;
    const timestamp = readTimestamp(value);
    if (timestamp !== null) {
      firstTimestamp = firstTimestamp === null ? timestamp : Math.min(firstTimestamp, timestamp);
      lastTimestamp = lastTimestamp === null ? timestamp : Math.max(lastTimestamp, timestamp);
    }
    const category = readCategory(value);
    categories[category] = (categories[category] ?? 0) + 1;
  }

  return {
    relativePath: relative(root, filePath).replace(/\\/gu, '/'),
    sizeBytes: metadata.size,
    entryCount,
    malformedLineCount,
    firstTimestamp,
    lastTimestamp,
    categories,
  };
}

function readTimestamp(value: Readonly<Record<string, unknown>>): number | null {
  return typeof value['ts'] === 'number' && Number.isFinite(value['ts']) ? value['ts'] : null;
}

function readCategory(value: Readonly<Record<string, unknown>>): string {
  const event = value['event'];
  if (isRecord(event) && typeof event['type'] === 'string' && event['type'].trim()) {
    return `event:${event['type']}`;
  }
  return typeof value['type'] === 'string' && value['type'].trim() ? value['type'] : 'unknown';
}

function mergeCategoryCounts(
  categorySets: readonly Readonly<Record<string, number>>[],
): Readonly<Record<string, number>> {
  const merged: Record<string, number> = {};
  for (const categories of categorySets) {
    for (const [category, count] of Object.entries(categories)) {
      merged[category] = (merged[category] ?? 0) + count;
    }
  }
  return merged;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function minimumTimestamp(values: readonly (number | null)[]): number | null {
  const timestamps = values.filter((value): value is number => value !== null);
  return timestamps.length > 0 ? Math.min(...timestamps) : null;
}

function maximumTimestamp(values: readonly (number | null)[]): number | null {
  const timestamps = values.filter((value): value is number => value !== null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorWithCode(value: unknown): value is { readonly code: string } {
  return (
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
  );
}
