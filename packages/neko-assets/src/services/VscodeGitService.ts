/**
 * VS Code Git Service
 *
 * Implements IGitService by leveraging the built-in VS Code Git extension API.
 * Provides file version retrieval and history for asset diff operations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { IGitService } from '@neko/asset';
import type { FileVersion } from '@neko/shared';

// =============================================================================
// VS Code Git Extension API Types (subset we need)
// =============================================================================

interface GitExtensionAPI {
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
}

interface Repository {
  rootUri: vscode.Uri;
  show(ref: string, filePath: string): Promise<string>;
  log(options?: LogOptions): Promise<Commit[]>;
}

interface LogOptions {
  maxEntries?: number;
  path?: string;
}

interface Commit {
  hash: string;
  message: string;
  authorName?: string;
  authorEmail?: string;
  authorDate?: Date;
}

// =============================================================================
// Implementation
// =============================================================================

export class VscodeGitService implements IGitService {
  private gitApi: GitAPI | null = null;

  constructor(private readonly tempRoot: string) {}

  /**
   * Lazily acquire the Git extension API.
   */
  private async getGitApi(): Promise<GitAPI | null> {
    if (this.gitApi) return this.gitApi;

    const gitExtension = vscode.extensions.getExtension<GitExtensionAPI>('vscode.git');
    if (!gitExtension) return null;

    if (!gitExtension.isActive) {
      await gitExtension.activate();
    }

    this.gitApi = gitExtension.exports.getAPI(1);
    return this.gitApi;
  }

  /**
   * Find the repository that contains the given file path.
   */
  private async findRepository(filePath: string): Promise<Repository | null> {
    const api = await this.getGitApi();
    if (!api) return null;

    const normalizedPath = filePath.replace(/\\/g, '/');
    for (const repo of api.repositories) {
      const repoRoot = repo.rootUri.fsPath.replace(/\\/g, '/');
      if (normalizedPath.startsWith(repoRoot)) {
        return repo;
      }
    }

    return null;
  }

  /**
   * Get file content at a specific Git ref.
   * Writes the content to a temp file and returns the temp path.
   */
  async getFileAtRef(filePath: string, ref: string): Promise<string> {
    const repo = await this.findRepository(filePath);
    if (!repo) {
      throw new Error(`No Git repository found for: ${filePath}`);
    }

    // Get relative path from repo root
    const repoRoot = repo.rootUri.fsPath;
    const relativePath = path.relative(repoRoot, filePath);

    // Get file content at ref
    const content = await repo.show(ref, relativePath);

    // Write to temp file so diff service can read it
    const ext = path.extname(filePath);
    const tempDir = path.join(this.tempRoot, 'neko-assets-diff');
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${ref.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`);
    await fs.writeFile(tempPath, content);

    return tempPath;
  }

  /**
   * Get Git version history for a file.
   */
  async getFileHistory(filePath: string): Promise<FileVersion[]> {
    const repo = await this.findRepository(filePath);
    if (!repo) {
      return [];
    }

    const repoRoot = repo.rootUri.fsPath;
    const relativePath = path.relative(repoRoot, filePath);

    const commits = await repo.log({
      maxEntries: 50,
      path: relativePath,
    });

    return commits.map((commit) => ({
      commitHash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      timestamp: commit.authorDate?.getTime() ?? Date.now(),
      message: commit.message,
      author: commit.authorName ?? 'Unknown',
      changeType: 'modified' as const,
    }));
  }
}
