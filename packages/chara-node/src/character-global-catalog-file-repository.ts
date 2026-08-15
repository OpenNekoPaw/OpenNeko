import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  parseCharacterVersion,
  parseCharacterWorkspaceGlobalLink,
  parseGlobalCharacter,
  parseGlobalCharacterCatalog,
  parseGlobalCharacterVersion,
  type CharacterWorkspaceGlobalLink,
  type CharacterVersion,
  type GlobalCharacter,
  type GlobalCharacterCatalog,
  type GlobalCharacterVersion,
} from '@neko/chara/contracts';
import type { CharacterGlobalCatalogRepository } from '@neko/chara/application';

interface CharacterGlobalAggregate {
  readonly character: GlobalCharacter;
  readonly versions: readonly GlobalCharacterVersion[];
  readonly links: readonly CharacterWorkspaceGlobalLink[];
}

export class CharacterGlobalCatalogFileRepository implements CharacterGlobalCatalogRepository {
  private commitTail: Promise<void> = Promise.resolve();

  constructor(private readonly root: string) {
    if (!isAbsolute(root)) throw new Error('Global Character catalog root must be absolute.');
  }

  async readCatalog(signal?: AbortSignal): Promise<GlobalCharacterCatalog> {
    signal?.throwIfAborted();
    const characters: GlobalCharacter[] = [];
    const versions: GlobalCharacterVersion[] = [];
    const links: CharacterWorkspaceGlobalLink[] = [];
    const diagnostics: GlobalCharacterCatalog['diagnostics'][number][] = [];
    for (const file of await this.listAggregateFiles(signal)) {
      try {
        const aggregate = await this.readAggregateFile(file, signal);
        characters.push(aggregate.character);
        versions.push(...aggregate.versions);
        links.push(...aggregate.links);
      } catch (error) {
        diagnostics.push({
          recordKind: 'global-character',
          recordId: file.slice(0, -5),
          message: describeError(error),
        });
      }
    }
    return parseGlobalCharacterCatalog({ characters, versions, links, diagnostics });
  }

  async readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined> {
    signal?.throwIfAborted();
    const version = (await this.readCatalog(signal)).versions.find(
      (version) => version.characterVersionId === characterVersionId,
    );
    return version === undefined
      ? undefined
      : parseCharacterVersion({
          characterVersionId: version.characterVersionId,
          characterProjectId: version.globalCharacterId,
          label: version.label,
          definition: version.definition,
          acceptedEvidenceIds: version.acceptedEvidenceIds,
          publishedAt: version.publishedAt,
        });
  }

  commitCatalog(
    input: Parameters<CharacterGlobalCatalogRepository['commitCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    const commit = this.commitTail.then(() => this.commitNow(input, signal));
    this.commitTail = commit.catch(() => undefined);
    return commit;
  }

  commitGlobalCatalog(
    input: Parameters<CharacterGlobalCatalogRepository['commitGlobalCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    const commit = this.commitTail.then(() => this.commitGlobalNow(input, signal));
    this.commitTail = commit.catch(() => undefined);
    return commit;
  }

  private async commitNow(
    input: Parameters<CharacterGlobalCatalogRepository['commitCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const character = parseGlobalCharacter(input.character);
    const version = parseGlobalCharacterVersion(input.version);
    const link = parseCharacterWorkspaceGlobalLink(input.link);
    if (!character.characterVersionIds.includes(version.characterVersionId)) {
      throw new Error('GlobalCharacter commit does not include the exact CharacterVersion.');
    }
    if (
      link.globalCharacterId !== character.globalCharacterId ||
      link.lastSyncedCharacterVersionId !== version.characterVersionId ||
      version.globalCharacterId !== character.globalCharacterId
    ) {
      throw new Error('Character Workspace link does not match the synchronization commit.');
    }
    const file = aggregateFileName(character.globalCharacterId);
    const existing = await this.tryReadAggregateFile(file, signal);
    if (!existing) {
      if (input.expectedCurrentCharacterVersionId !== undefined) {
        throw new Error(`GlobalCharacter '${character.globalCharacterId}' is unavailable.`);
      }
      if (character.characterVersionIds.length !== 1) {
        throw new Error('A new GlobalCharacter must commit exactly one first version.');
      }
    } else {
      if (
        existing.character.currentCharacterVersionId !== input.expectedCurrentCharacterVersionId
      ) {
        throw new Error(`GlobalCharacter '${character.globalCharacterId}' changed before commit.`);
      }
      if (
        character.characterVersionIds.length !==
          existing.character.characterVersionIds.length + 1 ||
        existing.character.characterVersionIds.some(
          (identity, index) => character.characterVersionIds[index] !== identity,
        )
      ) {
        throw new Error('GlobalCharacter history must append exactly one immutable version.');
      }
      if (
        existing.versions.some((item) => item.characterVersionId === version.characterVersionId)
      ) {
        throw new Error(`CharacterVersion '${version.characterVersionId}' already exists.`);
      }
    }
    const links = [
      ...(existing?.links.filter((item) => item.characterProjectId !== link.characterProjectId) ??
        []),
      link,
    ];
    const aggregate = parseAggregate({
      character,
      versions: [...(existing?.versions ?? []), version],
      links,
    });
    if (existing && isDeepStrictEqual(existing, aggregate)) return;
    await this.writeAggregateFile(file, aggregate, signal);
  }

  private async commitGlobalNow(
    input: Parameters<CharacterGlobalCatalogRepository['commitGlobalCatalog']>[0],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const character = parseGlobalCharacter(input.character);
    const version = parseGlobalCharacterVersion(input.version);
    if (!character.characterVersionIds.includes(version.characterVersionId)) {
      throw new Error('GlobalCharacter import does not include the exact CharacterVersion.');
    }
    if (version.globalCharacterId !== character.globalCharacterId) {
      throw new Error('GlobalCharacterVersion owner does not match its GlobalCharacter.');
    }
    const file = aggregateFileName(character.globalCharacterId);
    const existing = await this.tryReadAggregateFile(file, signal);
    if (!existing) {
      if (input.expectedCurrentCharacterVersionId !== undefined) {
        throw new Error(`GlobalCharacter '${character.globalCharacterId}' is unavailable.`);
      }
      if (character.characterVersionIds.length !== 1) {
        throw new Error('A new imported GlobalCharacter must commit exactly one first version.');
      }
    } else {
      if (
        existing.character.currentCharacterVersionId !== input.expectedCurrentCharacterVersionId
      ) {
        throw new Error(`GlobalCharacter '${character.globalCharacterId}' changed before import.`);
      }
      if (
        character.characterVersionIds.length !==
          existing.character.characterVersionIds.length + 1 ||
        existing.character.characterVersionIds.some(
          (identity, index) => character.characterVersionIds[index] !== identity,
        )
      ) {
        throw new Error(
          'Imported GlobalCharacter history must append exactly one immutable version.',
        );
      }
      if (
        existing.versions.some((item) => item.characterVersionId === version.characterVersionId)
      ) {
        throw new Error(`CharacterVersion '${version.characterVersionId}' already exists.`);
      }
    }
    await this.writeAggregateFile(
      file,
      parseAggregate({
        character,
        versions: [...(existing?.versions ?? []), version],
        links: existing?.links ?? [],
      }),
      signal,
    );
  }

  private async listAggregateFiles(signal?: AbortSignal): Promise<readonly string[]> {
    const directory = await this.requireDirectory(signal);
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter(
          (entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.json'),
        )
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if (isErrorCode(error, 'ENOENT')) return [];
      throw error;
    }
  }

  private async tryReadAggregateFile(
    file: string,
    signal?: AbortSignal,
  ): Promise<CharacterGlobalAggregate | undefined> {
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
  ): Promise<CharacterGlobalAggregate> {
    signal?.throwIfAborted();
    const directory = await this.requireDirectory(signal);
    const source = await readFile(join(directory, file), 'utf8');
    return parseAggregate(JSON.parse(source));
  }

  private async writeAggregateFile(
    file: string,
    aggregate: CharacterGlobalAggregate,
    signal?: AbortSignal,
  ): Promise<void> {
    const directory = await this.requireDirectory(signal);
    const target = join(directory, file);
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
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private async requireDirectory(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const canonicalRoot = await realpath(this.root);
    const directory = resolve(canonicalRoot, 'neko/global-characters');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const canonicalDirectory = await realpath(directory);
    const relativePath = relative(canonicalRoot, canonicalDirectory);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Global Character catalog directory escapes its authorized root.');
    }
    return canonicalDirectory;
  }
}

function parseAggregate(value: unknown): CharacterGlobalAggregate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Global Character aggregate must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record);
  if (keys.length !== 3 || keys.some((key) => !['character', 'versions', 'links'].includes(key))) {
    throw new Error('Global Character aggregate has unknown or missing fields.');
  }
  if (!Array.isArray(record['versions']) || !Array.isArray(record['links'])) {
    throw new Error('Global Character aggregate versions and links must be arrays.');
  }
  const character = parseGlobalCharacter(record['character']);
  const versions = record['versions'].map(parseGlobalCharacterVersion);
  const links = record['links'].map(parseCharacterWorkspaceGlobalLink);
  if (
    versions.length !== character.characterVersionIds.length ||
    versions.some(
      (version, index) => version.characterVersionId !== character.characterVersionIds[index],
    )
  ) {
    throw new Error('Global Character aggregate history does not match its immutable versions.');
  }
  if (new Set(links.map((link) => link.characterProjectId)).size !== links.length) {
    throw new Error('Global Character aggregate contains duplicate Workspace links.');
  }
  return { character, versions, links };
}

function aggregateFileName(identity: string): string {
  return `${Buffer.from(identity, 'utf8').toString('base64url')}.json`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
