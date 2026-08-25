import { opendir, lstat } from 'node:fs/promises';
import * as path from 'node:path';
import type { LocalMetadataRepositories } from '@neko/local-metadata';
import type { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import type {
  DesktopStorageEntryView,
  DesktopStorageSettingsProjection,
  DesktopStorageSettingsRequest,
} from '@neko/host/desktop-storage-settings-contract';
import { PathResolver } from '@neko/shared/path';

export interface DesktopStorageSettingsRuntimeOptions {
  readonly homedir: string;
  readonly repositories: Pick<LocalMetadataRepositories, 'workspaces'>;
  readonly applicationSettings: DesktopApplicationSettingsService;
  readonly selectDirectory: (defaultPath: string) => Promise<string | undefined>;
  readonly openDirectory: (targetPath: string) => Promise<void>;
}

export class DesktopStorageSettingsRuntime {
  private readonly homedir: string;
  private readonly resolver: PathResolver;

  constructor(private readonly options: DesktopStorageSettingsRuntimeOptions) {
    this.homedir = path.resolve(options.homedir);
    this.resolver = new PathResolver(new Map([['HOME', this.homedir]]));
  }

  async execute(request: DesktopStorageSettingsRequest): Promise<{
    readonly status: 'projected' | 'opened' | 'updated' | 'cancelled';
    readonly projection: DesktopStorageSettingsProjection;
  }> {
    if (request.operation === 'get') {
      return { status: 'projected', projection: await this.project() };
    }
    if (request.operation === 'open') {
      const targets = await this.resolveTargets();
      const target = targets.get(request.entryId);
      if (!target) throw new Error(`Desktop storage entry '${request.entryId}' does not exist.`);
      await this.options.openDirectory(target.path);
      return { status: 'opened', projection: await this.projectFromTargets(targets) };
    }
    const current = this.options.applicationSettings.current.preferences;
    const selected = await this.options.selectDirectory(
      this.resolver.resolve(current.defaultWorkspaceLocator),
    );
    if (!selected) return { status: 'cancelled', projection: await this.project() };
    const locator = this.contractHomePath(selected);
    await this.options.applicationSettings.update({
      ...current,
      defaultWorkspaceLocator: locator,
    });
    return { status: 'updated', projection: await this.project() };
  }

  async project(): Promise<DesktopStorageSettingsProjection> {
    return this.projectFromTargets(await this.resolveTargets());
  }

  private async projectFromTargets(
    targets: ReadonlyMap<string, StorageTarget>,
  ): Promise<DesktopStorageSettingsProjection> {
    const entries: DesktopStorageEntryView[] = [];
    for (const target of targets.values()) {
      try {
        entries.push({ ...target.view, bytes: await measureDirectory(target.path) });
      } catch (error: unknown) {
        entries.push({
          ...target.view,
          diagnostic: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      entries,
      defaultWorkspaceLocator:
        this.options.applicationSettings.current.preferences.defaultWorkspaceLocator,
    };
  }

  private async resolveTargets(): Promise<ReadonlyMap<string, StorageTarget>> {
    const targets = new Map<string, StorageTarget>();
    const add = (target: StorageTarget): void => {
      if (targets.has(target.view.id))
        throw new Error(`Duplicate storage entry '${target.view.id}'.`);
      targets.set(target.view.id, target);
    };
    add({
      path: path.join(this.homedir, '.neko'),
      view: {
        id: 'application-data',
        kind: 'application-data',
        label: 'OpenNeko',
        locator: '${HOME}/.neko',
      },
    });
    add({
      path: path.join(this.homedir, '.neko', 'media-libraries'),
      view: {
        id: 'media-library',
        kind: 'media-library',
        label: 'Media libraries',
        locator: '${HOME}/.neko/media-libraries',
      },
    });
    const defaultLocator =
      this.options.applicationSettings.current.preferences.defaultWorkspaceLocator;
    add({
      path: this.resolver.resolve(defaultLocator),
      view: {
        id: 'default-workspace',
        kind: 'default-workspace',
        label: 'New projects',
        locator: defaultLocator,
      },
    });
    const records = await this.options.repositories.workspaces.listAll();
    for (const record of records) {
      const locator =
        record.currentLocator.kind === 'variable'
          ? record.currentLocator.value
          : `${'${HOME}'}/${record.currentLocator.value}`;
      const resolved =
        record.currentLocator.kind === 'variable'
          ? this.resolver.resolve(record.currentLocator.value)
          : path.resolve(this.homedir, record.currentLocator.value);
      add({
        path: resolved,
        view: {
          id: `project:${record.workspaceId}`,
          kind: 'project',
          label: path.basename(resolved),
          locator,
        },
      });
    }
    return targets;
  }

  private contractHomePath(selectedPath: string): string {
    const relative = path.relative(this.homedir, path.resolve(selectedPath));
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('Default project directory must be inside the current HOME directory.');
    }
    return `${'${HOME}'}/${relative.split(path.sep).join('/')}`;
  }
}

interface StorageTarget {
  readonly path: string;
  readonly view: Omit<DesktopStorageEntryView, 'bytes' | 'diagnostic'>;
}

async function measureDirectory(root: string): Promise<number> {
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error: unknown) {
    if (isNodeError(error, 'ENOENT')) return 0;
    throw error;
  }
  if (rootStat.isSymbolicLink()) throw new Error('Storage root must not be a symbolic link.');
  if (!rootStat.isDirectory()) throw new Error('Storage root is not a directory.');
  let total = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) throw new Error('Storage traversal stack is unexpectedly empty.');
    const directory = await opendir(current);
    for await (const entry of directory) {
      const entryPath = path.join(current, entry.name);
      const entryStat = await lstat(entryPath);
      if (entryStat.isSymbolicLink()) continue;
      if (entryStat.isDirectory()) pending.push(entryPath);
      else if (entryStat.isFile()) total += entryStat.size;
    }
  }
  return total;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
