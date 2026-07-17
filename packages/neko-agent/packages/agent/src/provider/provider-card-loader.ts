import { join, relative } from 'node:path';
import type { IProviderCardRegistry, ProviderCard, ProviderCardLayer } from '@neko/shared';
import { parseProviderCardMarkdown } from './provider-card-parser';

export interface ProviderCardLoaderFs {
  readdir(path: string, options: { withFileTypes: true }): Promise<readonly ProviderCardDirent[]>;
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
}

export interface ProviderCardDirent {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface LoadProviderCardDirectoryOptions {
  readonly root: string;
  readonly sourceLayer: ProviderCardLayer;
  readonly fs: ProviderCardLoaderFs;
  readonly recursive?: boolean;
  readonly sourceRefPrefix?: string;
  readonly onError?: (error: ProviderCardLoadError) => void;
}

export interface RegisterProviderCardDirectoryOptions extends LoadProviderCardDirectoryOptions {
  readonly registry: IProviderCardRegistry;
}

export interface ProviderCardLoadError {
  readonly path: string;
  readonly reason: 'read-failed' | 'parse-failed';
  readonly cause: unknown;
}

export async function loadProviderCardDirectory(
  options: LoadProviderCardDirectoryOptions,
): Promise<readonly ProviderCard[]> {
  const files = await listProviderCardFiles(options.root, options.fs, options.recursive ?? false);
  const cards: ProviderCard[] = [];

  for (const filePath of files) {
    try {
      const markdown = await options.fs.readFile(filePath, 'utf-8');
      cards.push(
        parseProviderCardMarkdown(markdown, {
          sourceLayer: options.sourceLayer,
          sourceRef: buildSourceRef(options.root, filePath, options.sourceRefPrefix),
        }),
      );
    } catch (cause) {
      options.onError?.({
        path: filePath,
        reason: isReadError(cause) ? 'read-failed' : 'parse-failed',
        cause,
      });
    }
  }

  return cards;
}

export async function registerProviderCardDirectory(
  options: RegisterProviderCardDirectoryOptions,
): Promise<readonly ProviderCard[]> {
  const cards = await loadProviderCardDirectory(options);
  for (const card of cards) {
    options.registry.register(card);
  }
  return cards;
}

async function listProviderCardFiles(
  root: string,
  fs: ProviderCardLoaderFs,
  recursive: boolean,
): Promise<readonly string[]> {
  let entries: readonly ProviderCardDirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith('.card.md')) {
      files.push(entryPath);
      continue;
    }
    if (recursive && entry.isDirectory()) {
      files.push(...(await listProviderCardFiles(entryPath, fs, true)));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function buildSourceRef(root: string, filePath: string, prefix: string | undefined): string {
  const relativePath = relative(root, filePath).split('\\').join('/');
  return prefix ? `${prefix.replace(/\/$/, '')}/${relativePath}` : relativePath;
}

function isReadError(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause;
}
