import type { PromptPresetConfig, PromptSource } from '@neko/shared';
import {
  DEFAULT_AGENTS_FILE_CONTENT,
  buildAgentsFileLoadPlan,
  buildPromptFileContent,
  ensurePromptFileExtension,
  generatePromptFileId,
  generatePromptFileName,
  projectPromptFileInfo,
  promptFileInfoToConfig,
  shouldScanPromptFile,
  syncPromptFilesWithConfig,
  type PromptFileInfo,
  type PromptFileScanResult,
} from './prompt-file-projector';
import {
  resolveAgentsFile,
  resolveNekoContentDir,
  resolvePersonalAgentsFile,
  resolvePersonalNekoContentDir,
  resolveProjectAgentsFile,
  resolveProjectNekoContentDir,
  type NekoContentSource,
} from '../workspace';

export interface PromptFileRuntimeStatLike {
  isFile(): boolean;
}

export interface PromptFileRuntimeFs {
  access(path: string): Promise<unknown>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<PromptFileRuntimeStatLike>;
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  writeFile(path: string, content: string, encoding: 'utf-8'): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
}

export interface PromptFileRuntimePath {
  join(...parts: string[]): string;
  dirname(path: string): string;
}

export interface PromptFileRuntimeLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface PromptFileRuntimeOptions {
  readonly fs: PromptFileRuntimeFs;
  readonly path: PromptFileRuntimePath;
  readonly homeDir: string;
  readonly getWorkspaceRoot?: () => string | null | undefined;
  readonly logger?: Partial<PromptFileRuntimeLogger>;
}

export interface SavePromptFileInput {
  source: PromptSource;
  name: string;
  content: string;
  existingFileName?: string;
}

export interface PromptFileSaveResult {
  filePath: string;
  id: string;
}

export interface LoadedAgentsFile {
  content: string;
  source: NekoContentSource;
}

export interface PromptFileRuntime {
  getUserPromptDir(): string;
  getWorkspacePromptDir(): string | null;
  getUserAgentsFilePath(): string;
  getWorkspaceAgentsFilePath(): string | null;
  getAgentsFilePath(source: NekoContentSource): string | null;
  getPromptFilePath(source: PromptSource, fileName: string): string | null;
  getPromptWatchDirs(): readonly string[];
  generateFileName(name: string): string;
  scanPromptFiles(): Promise<PromptFileScanResult>;
  savePromptFile(input: SavePromptFileInput): Promise<PromptFileSaveResult>;
  createPromptFile(source: PromptSource, name: string): Promise<PromptFileSaveResult>;
  readPromptFile(filePath: string): Promise<string | null>;
  deletePromptFile(filePath: string): Promise<boolean>;
  fileInfoToConfig(info: PromptFileInfo): PromptPresetConfig;
  syncWithConfig(
    scanResult: PromptFileScanResult,
    existingPrompts: PromptPresetConfig[],
  ): Promise<PromptPresetConfig[]>;
  loadAgentsFile(): Promise<LoadedAgentsFile | null>;
  agentsFileExists(source: NekoContentSource): Promise<boolean>;
  createAgentsFile(source: NekoContentSource, content?: string): Promise<string | null>;
  ensureAgentsFile(source: NekoContentSource): Promise<string>;
}

export function createPromptFileRuntime(options: PromptFileRuntimeOptions): PromptFileRuntime {
  return new DefaultPromptFileRuntime(options);
}

class DefaultPromptFileRuntime implements PromptFileRuntime {
  constructor(private readonly options: PromptFileRuntimeOptions) {}

  getUserPromptDir(): string {
    return resolvePersonalNekoContentDir(this.options.homeDir, 'prompts');
  }

  getWorkspacePromptDir(): string | null {
    return resolveProjectNekoContentDir(this.getWorkspaceRoot(), 'prompts');
  }

  getUserAgentsFilePath(): string {
    return resolvePersonalAgentsFile(this.options.homeDir);
  }

  getWorkspaceAgentsFilePath(): string | null {
    return resolveProjectAgentsFile(this.getWorkspaceRoot());
  }

  getAgentsFilePath(source: NekoContentSource): string | null {
    return resolveAgentsFile({
      source,
      homeDir: this.options.homeDir,
      workspaceRoot: this.getWorkspaceRoot(),
    });
  }

  getPromptFilePath(source: PromptSource, fileName: string): string | null {
    if (source === 'builtin') {
      return null;
    }

    const baseDir = resolveNekoContentDir({
      source,
      subdir: 'prompts',
      homeDir: this.options.homeDir,
      workspaceRoot: this.getWorkspaceRoot(),
    });
    if (!baseDir) {
      return null;
    }

    return this.options.path.join(baseDir, ensurePromptFileExtension(fileName));
  }

  getPromptWatchDirs(): readonly string[] {
    const dirs = [this.getUserPromptDir()];
    const workspaceDir = this.getWorkspacePromptDir();
    if (workspaceDir) {
      dirs.push(workspaceDir);
    }
    return dirs;
  }

  generateFileName(name: string): string {
    return generatePromptFileName(name);
  }

  async scanPromptFiles(): Promise<PromptFileScanResult> {
    const result: PromptFileScanResult = {
      personal: await this.scanDirectory(this.getUserPromptDir(), 'personal'),
      project: [],
    };

    const workspaceDir = this.getWorkspacePromptDir();
    if (workspaceDir) {
      result.project = await this.scanDirectory(workspaceDir, 'project');
    }

    return result;
  }

  async savePromptFile({
    source,
    name,
    content,
    existingFileName,
  }: SavePromptFileInput): Promise<PromptFileSaveResult> {
    const fileName = existingFileName || this.generateFileName(name);
    const filePath = this.getPromptFilePath(source, fileName);

    if (!filePath) {
      throw new Error('Cannot determine prompt file path');
    }

    await this.options.fs.mkdir(this.options.path.dirname(filePath), { recursive: true });
    await this.options.fs.writeFile(filePath, content, 'utf-8');

    const id = generatePromptFileId(source, fileName);
    this.options.logger?.info?.('Saved prompt file:', { id, filePath });
    return { filePath, id };
  }

  async createPromptFile(source: PromptSource, name: string): Promise<PromptFileSaveResult> {
    return this.savePromptFile({
      source,
      name,
      content: buildPromptFileContent(name),
    });
  }

  async readPromptFile(filePath: string): Promise<string | null> {
    try {
      return await this.options.fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async deletePromptFile(filePath: string): Promise<boolean> {
    try {
      await this.options.fs.unlink(filePath);
      this.options.logger?.info?.('Deleted prompt file:', filePath);
      return true;
    } catch (error) {
      this.options.logger?.error?.('Failed to delete file:', error);
      return false;
    }
  }

  fileInfoToConfig(info: PromptFileInfo): PromptPresetConfig {
    return promptFileInfoToConfig(info);
  }

  async syncWithConfig(
    scanResult: PromptFileScanResult,
    existingPrompts: PromptPresetConfig[],
  ): Promise<PromptPresetConfig[]> {
    return syncPromptFilesWithConfig(scanResult, existingPrompts);
  }

  async loadAgentsFile(): Promise<LoadedAgentsFile | null> {
    for (const candidate of buildAgentsFileLoadPlan({
      homeDir: this.options.homeDir,
      workspaceRoot: this.getWorkspaceRoot(),
    })) {
      try {
        const content = await this.options.fs.readFile(candidate.filePath, 'utf-8');
        this.options.logger?.info?.(`Loaded ${candidate.source} AGENTS.md:`, candidate.filePath);
        return { content, source: candidate.source };
      } catch {
        // Missing candidates are expected; project overrides personal when present.
      }
    }

    return null;
  }

  async agentsFileExists(source: NekoContentSource): Promise<boolean> {
    const filePath = this.getAgentsFilePath(source);
    if (!filePath) {
      return false;
    }

    return this.pathExists(filePath);
  }

  async createAgentsFile(source: NekoContentSource, content?: string): Promise<string | null> {
    const filePath = this.getAgentsFilePath(source);
    if (!filePath) {
      return null;
    }

    await this.options.fs.mkdir(this.options.path.dirname(filePath), { recursive: true });
    await this.options.fs.writeFile(filePath, content || DEFAULT_AGENTS_FILE_CONTENT, 'utf-8');
    this.options.logger?.info?.('Created AGENTS.md:', filePath);

    return filePath;
  }

  async ensureAgentsFile(source: NekoContentSource): Promise<string> {
    const filePath = this.getAgentsFilePath(source);
    if (!filePath) {
      throw new Error('Cannot determine AGENTS.md file path');
    }

    if (!(await this.agentsFileExists(source))) {
      await this.createAgentsFile(source);
    }

    return filePath;
  }

  private getWorkspaceRoot(): string | null {
    return this.options.getWorkspaceRoot?.() ?? null;
  }

  private async scanDirectory(
    dirPath: string,
    source: Exclude<PromptSource, 'builtin'>,
  ): Promise<PromptFileInfo[]> {
    const prompts: PromptFileInfo[] = [];

    try {
      await this.options.fs.access(dirPath);
      const files = await this.options.fs.readdir(dirPath);

      for (const file of files) {
        if (!shouldScanPromptFile(file)) {
          continue;
        }

        const filePath = this.options.path.join(dirPath, file);
        try {
          const stat = await this.options.fs.stat(filePath);
          if (!stat.isFile()) {
            continue;
          }

          prompts.push(
            projectPromptFileInfo({
              source,
              fileName: file,
              filePath,
              content: await this.options.fs.readFile(filePath, 'utf-8'),
            }),
          );
        } catch (error) {
          this.options.logger?.warn?.(`Failed to read file ${filePath}:`, error);
        }
      }
    } catch {
      // Missing prompt directories are created lazily by save/create operations.
    }

    return prompts;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await this.options.fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
