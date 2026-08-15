import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  parseGlobalWorld,
  parseGlobalWorldCatalog,
  parseGlobalWorldVersion,
  parseWorldWorkspaceGlobalLink,
  parseWorldVersion,
  type GlobalWorld,
  type GlobalWorldCatalog,
  type GlobalWorldVersion,
  type WorldVersion,
  type WorldWorkspaceGlobalLink,
} from '@neko/world/contracts';
import type { WorldGlobalCatalogRepository } from '@neko/world/application';

interface WorldGlobalAggregate {
  readonly world: GlobalWorld;
  readonly versions: readonly GlobalWorldVersion[];
  readonly links: readonly WorldWorkspaceGlobalLink[];
}

export class WorldGlobalCatalogFileRepository implements WorldGlobalCatalogRepository {
  private commitTail: Promise<void> = Promise.resolve();

  constructor(private readonly root: string) {
    if (!isAbsolute(root)) throw new Error('Global World catalog root must be absolute.');
  }

  async readCatalog(signal?: AbortSignal): Promise<GlobalWorldCatalog> {
    signal?.throwIfAborted();
    const worlds: GlobalWorld[] = [];
    const versions: GlobalWorldVersion[] = [];
    const links: WorldWorkspaceGlobalLink[] = [];
    const diagnostics: GlobalWorldCatalog['diagnostics'][number][] = [];
    for (const file of await this.listAggregateFiles(signal)) {
      try {
        const aggregate = await this.readAggregateFile(file, signal);
        worlds.push(aggregate.world);
        versions.push(...aggregate.versions);
        links.push(...aggregate.links);
      } catch (error) {
        diagnostics.push({
          recordKind: 'global-world',
          recordId: file.slice(0, -5),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return parseGlobalWorldCatalog({ worlds, versions, links, diagnostics });
  }

  async readPublication(
    worldVersionId: string,
    signal?: AbortSignal,
  ): Promise<WorldVersion | undefined> {
    signal?.throwIfAborted();
    const version = (await this.readCatalog(signal)).versions.find(
      (version) => version.worldVersionId === worldVersionId,
    );
    return version === undefined
      ? undefined
      : parseWorldVersion({
          worldVersionId: version.worldVersionId,
          worldProjectId: version.globalWorldId,
          label: version.label,
          definition: version.definition,
          acceptedSourceRefIds: version.acceptedSourceRefIds,
          publishedAt: version.publishedAt,
        });
  }

  commitCatalog(
    input: Parameters<WorldGlobalCatalogRepository['commitCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    const commit = this.commitTail.then(() => this.commitNow(input, signal));
    this.commitTail = commit.catch(() => undefined);
    return commit;
  }

  commitGlobalCatalog(
    input: Parameters<WorldGlobalCatalogRepository['commitGlobalCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    const commit = this.commitTail.then(() => this.commitGlobalNow(input, signal));
    this.commitTail = commit.catch(() => undefined);
    return commit;
  }

  private async commitNow(
    input: Parameters<WorldGlobalCatalogRepository['commitCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const world = parseGlobalWorld(input.world);
    const version = parseGlobalWorldVersion(input.version);
    const link = parseWorldWorkspaceGlobalLink(input.link);
    if (!world.worldVersionIds.includes(version.worldVersionId)) {
      throw new Error('GlobalWorld commit does not include the exact WorldVersion.');
    }
    if (
      link.globalWorldId !== world.globalWorldId ||
      link.lastSyncedWorldVersionId !== version.worldVersionId ||
      version.globalWorldId !== world.globalWorldId
    ) {
      throw new Error('World Workspace link does not match the synchronization commit.');
    }
    const file = aggregateFileName(world.globalWorldId);
    const existing = await this.tryReadAggregateFile(file, signal);
    if (!existing) {
      if (input.expectedCurrentWorldVersionId !== undefined) {
        throw new Error(`GlobalWorld '${world.globalWorldId}' is unavailable.`);
      }
      if (world.worldVersionIds.length !== 1) {
        throw new Error('A new GlobalWorld must commit exactly one first version.');
      }
    } else {
      if (existing.world.currentWorldVersionId !== input.expectedCurrentWorldVersionId) {
        throw new Error(`GlobalWorld '${world.globalWorldId}' changed before commit.`);
      }
      if (
        world.worldVersionIds.length !== existing.world.worldVersionIds.length + 1 ||
        existing.world.worldVersionIds.some(
          (identity, index) => world.worldVersionIds[index] !== identity,
        )
      ) {
        throw new Error('GlobalWorld history must append exactly one immutable version.');
      }
      if (existing.versions.some((item) => item.worldVersionId === version.worldVersionId)) {
        throw new Error(`WorldVersion '${version.worldVersionId}' already exists.`);
      }
    }
    const links = [
      ...(existing?.links.filter((item) => item.worldProjectId !== link.worldProjectId) ?? []),
      link,
    ];
    await this.writeAggregateFile(
      file,
      parseAggregate({
        world,
        versions: [...(existing?.versions ?? []), version],
        links,
      }),
      signal,
    );
  }

  private async commitGlobalNow(
    input: Parameters<WorldGlobalCatalogRepository['commitGlobalCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const world = parseGlobalWorld(input.world);
    const version = parseGlobalWorldVersion(input.version);
    if (!world.worldVersionIds.includes(version.worldVersionId)) {
      throw new Error('GlobalWorld import does not include the exact WorldVersion.');
    }
    if (version.globalWorldId !== world.globalWorldId) {
      throw new Error('GlobalWorldVersion owner does not match its GlobalWorld.');
    }
    const file = aggregateFileName(world.globalWorldId);
    const existing = await this.tryReadAggregateFile(file, signal);
    if (!existing) {
      if (input.expectedCurrentWorldVersionId !== undefined) {
        throw new Error(`GlobalWorld '${world.globalWorldId}' is unavailable.`);
      }
      if (world.worldVersionIds.length !== 1) {
        throw new Error('A new imported GlobalWorld must commit exactly one first version.');
      }
    } else {
      if (existing.world.currentWorldVersionId !== input.expectedCurrentWorldVersionId) {
        throw new Error(`GlobalWorld '${world.globalWorldId}' changed before import.`);
      }
      if (
        world.worldVersionIds.length !== existing.world.worldVersionIds.length + 1 ||
        existing.world.worldVersionIds.some(
          (identity, index) => world.worldVersionIds[index] !== identity,
        )
      ) {
        throw new Error('Imported GlobalWorld history must append exactly one immutable version.');
      }
      if (existing.versions.some((item) => item.worldVersionId === version.worldVersionId)) {
        throw new Error(`WorldVersion '${version.worldVersionId}' already exists.`);
      }
    }
    await this.writeAggregateFile(
      file,
      parseAggregate({
        world,
        versions: [...(existing?.versions ?? []), version],
        links: existing?.links ?? [],
      }),
      signal,
    );
  }

  private async listAggregateFiles(signal?: AbortSignal): Promise<readonly string[]> {
    const directory = await this.requireDirectory(signal);
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
  }

  private async tryReadAggregateFile(
    file: string,
    signal?: AbortSignal,
  ): Promise<WorldGlobalAggregate | undefined> {
    try {
      return await this.readAggregateFile(file, signal);
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return undefined;
      throw error;
    }
  }

  private async readAggregateFile(
    file: string,
    signal?: AbortSignal,
  ): Promise<WorldGlobalAggregate> {
    signal?.throwIfAborted();
    const directory = await this.requireDirectory(signal);
    return parseAggregate(JSON.parse(await readFile(join(directory, file), 'utf8')));
  }

  private async writeAggregateFile(
    file: string,
    aggregate: WorldGlobalAggregate,
    signal?: AbortSignal,
  ): Promise<void> {
    const directory = await this.requireDirectory(signal);
    const temporary = join(directory, `.${file}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      signal?.throwIfAborted();
      await rename(temporary, join(directory, file));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private async requireDirectory(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const canonicalRoot = await realpath(this.root);
    const directory = resolve(canonicalRoot, 'neko/global-worlds');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const canonicalDirectory = await realpath(directory);
    const relativePath = relative(canonicalRoot, canonicalDirectory);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Global World catalog directory escapes its authorized root.');
    }
    return canonicalDirectory;
  }
}

function parseAggregate(value: unknown): WorldGlobalAggregate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Global World aggregate must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record);
  if (keys.length !== 3 || keys.some((key) => !['world', 'versions', 'links'].includes(key))) {
    throw new Error('Global World aggregate has unknown or missing fields.');
  }
  if (!Array.isArray(record['versions']) || !Array.isArray(record['links'])) {
    throw new Error('Global World aggregate versions and links must be arrays.');
  }
  const world = parseGlobalWorld(record['world']);
  const versions = record['versions'].map(parseGlobalWorldVersion);
  const links = record['links'].map(parseWorldWorkspaceGlobalLink);
  if (
    versions.length !== world.worldVersionIds.length ||
    versions.some((version, index) => version.worldVersionId !== world.worldVersionIds[index])
  ) {
    throw new Error('Global World aggregate history does not match its immutable versions.');
  }
  if (new Set(links.map((link) => link.worldProjectId)).size !== links.length) {
    throw new Error('Global World aggregate contains duplicate Workspace links.');
  }
  return { world, versions, links };
}

function aggregateFileName(identity: string): string {
  return `${Buffer.from(identity, 'utf8').toString('base64url')}.json`;
}

function isErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
