/**
 * GitMediaService - Git Media File Service
 *
 * Handles Git operations for media files:
 * - Detect media file changes in working directory
 * - Retrieve file content at different versions
 * - Integrate with VSCode Git Extension API
 *
 * Design:
 * - Uses VSCode Git Extension API for Git operations
 * - Falls back to command-line git if API unavailable
 * - Implements Disposable for proper cleanup
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  type MediaFileChange,
  type FileVersionPair,
  type GitChangeStatus,
  type GitCommitInfo,
  getMediaType,
} from '@neko/shared';
import { getLogger } from '../../utils/logger';
import { GitCliGateway, type GitCliTarget, type IGitCliGateway } from './GitCliGateway';

const logger = getLogger('GitMediaService');

// =============================================================================
// Git Extension Types (from VSCode Git Extension)
// =============================================================================

interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
  onDidCloseRepository: vscode.Event<Repository>;
}

interface Repository {
  rootUri: vscode.Uri;
  state: RepositoryState;
  show(ref: string, path: string): Promise<string>;
  diff(cached?: boolean): Promise<string>;
}

interface RepositoryState {
  HEAD: Ref | undefined;
  workingTreeChanges: Change[];
  indexChanges: Change[];
  mergeChanges: Change[];
}

interface Ref {
  commit?: string;
  name?: string;
}

interface Change {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri?: vscode.Uri;
  status: number;
}

// Git status codes
const Status = {
  INDEX_MODIFIED: 0,
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  INDEX_COPIED: 4,
  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
  IGNORED: 8,
  INTENT_TO_ADD: 9,
  ADDED_BY_US: 10,
  ADDED_BY_THEM: 11,
  DELETED_BY_US: 12,
  DELETED_BY_THEM: 13,
  BOTH_ADDED: 14,
  BOTH_DELETED: 15,
  BOTH_MODIFIED: 16,
};

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Git media service interface
 */
export interface IGitMediaService extends vscode.Disposable {
  /**
   * Check if service is ready
   */
  isReady(): boolean;

  /**
   * Get changed media files in working directory
   */
  getChangedMediaFiles(): Promise<MediaFileChange[]>;

  /**
   * Get file versions for comparison
   * @param uri - File URI
   * @param ref - Git ref (default: HEAD)
   */
  getFileVersions(uri: vscode.Uri, ref?: string): Promise<FileVersionPair>;

  /**
   * Get file content at specific commit
   * @param uri - File URI
   * @param commitHash - Commit hash
   */
  getFileAtCommit(uri: vscode.Uri, commitHash: string): Promise<Buffer>;

  /**
   * Check if file is tracked by Git
   */
  isTracked(uri: vscode.Uri): Promise<boolean>;

  /**
   * Get commit history for a file
   * @param uri - File URI
   * @param maxCount - Maximum number of commits to return (default: 20)
   * @returns Array of { hash, subject, date } ordered newest first
   */
  getFileHistory(uri: vscode.Uri, maxCount?: number): Promise<GitCommitInfo[]>;

  /**
   * Extract file at a Git ref directly to a local path (zero-copy).
   * Uses `git show` piped to a file stream — never loads content into memory.
   * @param uri - File URI in the workspace
   * @param ref - Git ref (e.g. 'HEAD', commit hash)
   * @param outputPath - Absolute path to write the file to
   */
  extractFileToPath(uri: vscode.Uri, ref: string, outputPath: string): Promise<void>;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Git media file service implementation
 */
export class GitMediaService implements IGitMediaService {
  private git: GitAPI | null = null;
  private repository: Repository | null = null;
  private disposables: vscode.Disposable[] = [];
  private initPromise: Promise<void> | null = null;

  constructor(private readonly gitCliGateway: IGitCliGateway = new GitCliGateway()) {
    this.initPromise = this.initialize();
  }

  /**
   * Initialize Git extension connection
   */
  private async initialize(): Promise<void> {
    try {
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!gitExtension) {
        logger.warn('Git extension not found');
        return;
      }

      const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();

      this.git = git.getAPI(1);

      // Set initial repository
      if (this.git.repositories.length > 0) {
        this.repository = this.git.repositories[0]!;
      }

      // Listen for repository changes
      this.disposables.push(
        this.git.onDidOpenRepository((repo) => {
          if (!this.repository) {
            this.repository = repo;
          }
        }),
        this.git.onDidCloseRepository((repo) => {
          if (this.repository === repo) {
            this.repository = this.git?.repositories[0] ?? null;
          }
        }),
      );
    } catch (error) {
      logger.error('Initialization failed:', error);
    }
  }

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  isReady(): boolean {
    return this.git !== null && this.repository !== null;
  }

  async getChangedMediaFiles(): Promise<MediaFileChange[]> {
    await this.ensureInitialized();

    if (!this.repository) {
      return [];
    }

    const changes: MediaFileChange[] = [];
    const state = this.repository.state;

    // Process working tree changes
    for (const change of state.workingTreeChanges) {
      const mediaType = getMediaType(change.uri.fsPath);
      if (mediaType) {
        changes.push({
          uri: change.uri.toString(),
          mediaType,
          status: this.mapGitStatus(change.status),
          oldUri: change.renameUri?.toString(),
        });
      }
    }

    // Process index changes
    for (const change of state.indexChanges) {
      const mediaType = getMediaType(change.uri.fsPath);
      if (mediaType) {
        // Avoid duplicates
        if (!changes.some((c) => c.uri === change.uri.toString())) {
          changes.push({
            uri: change.uri.toString(),
            mediaType,
            status: this.mapGitStatus(change.status),
            oldUri: change.renameUri?.toString(),
          });
        }
      }
    }

    return changes;
  }

  async getFileVersions(uri: vscode.Uri, ref: string = 'HEAD'): Promise<FileVersionPair> {
    await this.ensureInitialized();

    const mediaType = getMediaType(uri.fsPath);
    if (!mediaType) {
      throw new Error(`Unsupported media file: ${uri.fsPath}`);
    }

    // Get current version from filesystem
    const currentBuffer = await vscode.workspace.fs.readFile(uri);
    const current = Buffer.from(currentBuffer);

    // Get previous version from Git (handle new/untracked files)
    let previous: Buffer;
    const isNewFile = await this.isNewFile(uri);
    if (isNewFile) {
      // For new files, use empty buffer as previous version
      previous = Buffer.alloc(0);
    } else {
      previous = await this.getFileAtCommit(uri, ref);
    }

    return {
      current: current.buffer.slice(current.byteOffset, current.byteOffset + current.byteLength),
      previous: previous.buffer.slice(
        previous.byteOffset,
        previous.byteOffset + previous.byteLength,
      ),
      currentPath: uri.fsPath,
      previousPath: isNewFile ? '(new file)' : `${uri.fsPath}@${ref}`,
      mediaType,
      isNewFile,
    };
  }

  /**
   * Check if file is new (untracked or added but not committed)
   */
  private async isNewFile(uri: vscode.Uri): Promise<boolean> {
    if (!this.repository) {
      return false;
    }

    const state = this.repository.state;
    const uriStr = uri.toString();

    // Check if file is untracked
    const isUntracked = state.workingTreeChanges.some(
      (c) => c.uri.toString() === uriStr && c.status === Status.UNTRACKED,
    );
    if (isUntracked) {
      return true;
    }

    // Check if file is newly added in index (not yet committed)
    const isIndexAdded = state.indexChanges.some(
      (c) => c.uri.toString() === uriStr && c.status === Status.INDEX_ADDED,
    );
    if (isIndexAdded) {
      // Check if it exists in HEAD
      const existsInHead = await this.existsInRef(uri, 'HEAD');
      return !existsInHead;
    }

    return false;
  }

  /**
   * Check if file exists in a Git ref
   */
  private async existsInRef(uri: vscode.Uri, ref: string): Promise<boolean> {
    try {
      await this.getFileAtCommit(uri, ref);
      return true;
    } catch {
      return false;
    }
  }

  async getFileAtCommit(uri: vscode.Uri, commitHash: string): Promise<Buffer> {
    await this.ensureInitialized();

    // Try Git Extension API first
    if (this.repository) {
      try {
        const relativePath = this.getRelativePath(uri);
        const content = await this.repository.show(commitHash, relativePath);
        // Git show returns string for binary files, need to handle encoding
        return Buffer.from(content, 'binary');
      } catch (error) {
        logger.warn('Git API failed, falling back to CLI:', error);
      }
    }

    // Fallback to git CLI
    return this.getFileAtCommitCLI(uri, commitHash);
  }

  async isTracked(uri: vscode.Uri): Promise<boolean> {
    await this.ensureInitialized();
    return this.gitCliGateway.isTracked(this.getCliTarget(uri));
  }

  async getFileHistory(uri: vscode.Uri, maxCount: number = 20): Promise<GitCommitInfo[]> {
    await this.ensureInitialized();
    return this.gitCliGateway.getFileHistory(this.getCliTarget(uri), maxCount);
  }

  async extractFileToPath(uri: vscode.Uri, ref: string, outputPath: string): Promise<void> {
    await this.ensureInitialized();
    return this.gitCliGateway.extractFileToPath(this.getCliTarget(uri), ref, outputPath);
  }

  /**
   * Get file at commit using git CLI
   */
  private async getFileAtCommitCLI(uri: vscode.Uri, commitHash: string): Promise<Buffer> {
    return this.gitCliGateway.getFileAtCommit(this.getCliTarget(uri), commitHash);
  }

  private getCliTarget(uri: vscode.Uri): GitCliTarget {
    const repositoryRoot = this.repository?.rootUri.fsPath;
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    const cwd = repositoryRoot ?? workspaceRoot;

    if (!cwd) {
      throw new Error('File is not in a workspace');
    }

    return {
      cwd,
      relativePath: path.relative(cwd, uri.fsPath),
    };
  }

  /**
   * Get relative path from repository root
   */
  private getRelativePath(uri: vscode.Uri): string {
    if (this.repository) {
      return path.relative(this.repository.rootUri.fsPath, uri.fsPath);
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    }

    return uri.fsPath;
  }

  /**
   * Map Git status code to our status type
   */
  private mapGitStatus(status: number): GitChangeStatus {
    switch (status) {
      case Status.INDEX_ADDED:
      case Status.UNTRACKED:
      case Status.INTENT_TO_ADD:
        return 'added';
      case Status.INDEX_DELETED:
      case Status.DELETED:
        return 'deleted';
      case Status.INDEX_RENAMED:
        return 'renamed';
      default:
        return 'modified';
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.git = null;
    this.repository = null;
  }
}
