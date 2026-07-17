/**
 * Media Library Settings Service
 *
 * Manages .neko/settings.json (team-shared) and .neko/settings.local.json
 * (machine-specific overrides, gitignored).
 *
 * Provides resolved media library configuration and path variable maps
 * for the PathResolver.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type {
  MediaLibrarySettings,
  MediaLibraryLocalSettings,
  MediaLibraryEntry,
  ResolvedMediaLibrary,
  PathVariableMap,
} from '@neko/shared';
import { PathResolver } from '@neko/shared';
import {
  createHostWorkspacePathVariables,
  createMediaLibraryPathVariableMap,
  resolveWorkspaceMediaLibraries,
} from '@neko/host';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaLibrarySettings');

const SETTINGS_FILE = 'settings.json';
const SETTINGS_LOCAL_FILE = 'settings.local.json';
const DEBOUNCE_MS = 300;

export class MediaLibrarySettingsService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private settings: MediaLibrarySettings = {};
  private localSettings: MediaLibraryLocalSettings = {};
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly _onDidChange = new vscode.EventEmitter<ResolvedMediaLibrary[]>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly workspaceRoot: string) {
    this.setupWatchers();
  }

  /**
   * Load settings from disk.
   */
  async load(): Promise<void> {
    this.settings = (await this.readJsonFile<MediaLibrarySettings>(this.getSettingsPath())) ?? {};
    this.localSettings =
      (await this.readJsonFile<MediaLibraryLocalSettings>(this.getLocalSettingsPath())) ?? {};
    logger.info(`Loaded ${this.settings.mediaLibraries?.length ?? 0} media libraries`);
  }

  /**
   * Get resolved libraries (after applying local overrides and checking accessibility).
   */
  async getResolvedLibraries(): Promise<ResolvedMediaLibrary[]> {
    return [
      ...(await resolveWorkspaceMediaLibraries({
        settings: this.settings,
        localSettings: this.localSettings,
        workspaceRoot: this.workspaceRoot,
        resolvePath: (source) => this.resolveConfiguredPath(source),
        checkAccessible: (resolvedPath) => this.checkAccessible(resolvedPath),
      })),
    ];
  }

  /**
   * Get roots that are safe to expose as Webview localResourceRoots.
   */
  async getWebviewResourceRoots(): Promise<string[]> {
    const libraries = await this.getResolvedLibraries();
    return libraries
      .filter((library) => library.enabled && library.accessible)
      .map((library) => path.resolve(library.resolvedPath));
  }

  /**
   * Build PathVariableMap for PathResolver.
   */
  async getPathVariableMap(): Promise<PathVariableMap> {
    const libraries = await this.getResolvedLibraries();
    return createMediaLibraryPathVariableMap(libraries);
  }

  /**
   * Add a media library entry to settings.json.
   */
  async addLibrary(entry: MediaLibraryEntry): Promise<void> {
    if (!this.settings.mediaLibraries) {
      this.settings.mediaLibraries = [];
    }

    // Check for duplicate variable
    const existing = this.settings.mediaLibraries.find((e) => e.variable === entry.variable);
    if (existing) {
      throw new Error(`Variable "${entry.variable}" already exists`);
    }

    await this.assertDirectoryReadable(this.resolveConfiguredPath(entry.path));

    this.settings.mediaLibraries.push(entry);
    await this.writeSettings();
    await this.fireChanged();
  }

  /**
   * Remove a media library by variable name.
   */
  async removeLibrary(variable: string): Promise<void> {
    if (!this.settings.mediaLibraries) return;

    this.settings.mediaLibraries = this.settings.mediaLibraries.filter(
      (e) => e.variable !== variable,
    );
    await this.writeSettings();
    await this.fireChanged();
  }

  /**
   * Set a local override for a variable.
   */
  async setLocalOverride(variable: string, localPath: string): Promise<void> {
    if (!this.localSettings.mediaLibraryOverrides) {
      this.localSettings.mediaLibraryOverrides = {};
    }
    await this.assertDirectoryReadable(this.resolveConfiguredPath(localPath));
    this.localSettings.mediaLibraryOverrides[variable] = localPath;
    await this.writeLocalSettings();
    await this.fireChanged();
  }

  // =========================================================================
  // File Paths
  // =========================================================================

  private getSettingsPath(): string {
    return path.join(this.workspaceRoot, 'neko', SETTINGS_FILE);
  }

  private getLocalSettingsPath(): string {
    return path.join(this.workspaceRoot, '.neko', SETTINGS_LOCAL_FILE);
  }

  // =========================================================================
  // File I/O
  // =========================================================================

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async writeSettings(): Promise<void> {
    const filePath = this.getSettingsPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(this.settings, null, '\t'), 'utf-8');
  }

  private async writeLocalSettings(): Promise<void> {
    const filePath = this.getLocalSettingsPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(this.localSettings, null, '\t'), 'utf-8');
  }

  private async checkAccessible(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) return false;
      await fs.access(dirPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async assertDirectoryReadable(dirPath: string): Promise<void> {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Media library path is not a directory: ${dirPath}`);
    }
    await fs.access(dirPath, fs.constants.R_OK);
  }

  private resolveConfiguredPath(source: string): string {
    const homedir = os.homedir();
    const variables = createHostWorkspacePathVariables({
      workspaceRoot: this.workspaceRoot,
      homedir,
      nekoHome: path.join(homedir, '.neko'),
    });
    const resolved = new PathResolver(variables).resolveSource(
      expandHomeMarker(source, homedir),
      this.workspaceRoot,
    );
    return resolved.type === 'local' ? path.resolve(resolved.path) : source;
  }

  // =========================================================================
  // File Watcher
  // =========================================================================

  private setupWatchers(): void {
    const handleChange = () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.reload(), DEBOUNCE_MS);
    };

    // settings.json lives under neko/ (git-tracked)
    const factsDir = path.join(this.workspaceRoot, 'neko');
    const factsWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(factsDir, 'settings.json'),
    );

    // settings.local.json lives under .neko/ (gitignored)
    const localDir = path.join(this.workspaceRoot, '.neko');
    const localWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(localDir, 'settings.local.json'),
    );

    this.disposables.push(
      factsWatcher,
      factsWatcher.onDidChange(handleChange),
      factsWatcher.onDidCreate(handleChange),
      factsWatcher.onDidDelete(handleChange),
      localWatcher,
      localWatcher.onDidChange(handleChange),
      localWatcher.onDidCreate(handleChange),
      localWatcher.onDidDelete(handleChange),
    );
  }

  private async reload(): Promise<void> {
    await this.load();
    await this.fireChanged();
  }

  private async fireChanged(): Promise<void> {
    const libraries = await this.getResolvedLibraries();
    this._onDidChange.fire(libraries);
  }

  dispose(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    this._onDidChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

function expandHomeMarker(value: string, homedir: string): string {
  if (value === '~') {
    return homedir;
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir, value.slice(2));
  }
  return value;
}
