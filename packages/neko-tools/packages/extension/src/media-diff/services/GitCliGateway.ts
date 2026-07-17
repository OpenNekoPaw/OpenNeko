import { execFile, spawn } from 'child_process';
import { createWriteStream } from 'fs';
import type { GitCommitInfo } from '@neko/shared';

export interface GitCliTarget {
  cwd: string;
  relativePath: string;
}

export interface IGitCliGateway {
  getFileAtCommit(target: GitCliTarget, ref: string): Promise<Buffer>;
  isTracked(target: GitCliTarget): Promise<boolean>;
  getFileHistory(target: GitCliTarget, maxCount?: number): Promise<GitCommitInfo[]>;
  extractFileToPath(target: GitCliTarget, ref: string, outputPath: string): Promise<void>;
}

function execGitText(
  target: GitCliTarget,
  args: string[],
  maxBuffer: number = 1024 * 1024,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: target.cwd,
        encoding: 'utf8',
        maxBuffer,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(typeof stdout === 'string' ? stdout : stdout.toString('utf8'));
      },
    );
  });
}

function execGitBuffer(
  target: GitCliTarget,
  args: string[],
  maxBuffer: number = 100 * 1024 * 1024,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: target.cwd,
        encoding: 'buffer',
        maxBuffer,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      },
    );
  });
}

export class GitCliGateway implements IGitCliGateway {
  async getFileAtCommit(target: GitCliTarget, ref: string): Promise<Buffer> {
    try {
      return await execGitBuffer(target, ['show', `${ref}:${target.relativePath}`]);
    } catch (error) {
      throw new Error(
        `Failed to get file at ${ref}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async isTracked(target: GitCliTarget): Promise<boolean> {
    try {
      const stdout = await execGitText(target, [
        'ls-files',
        '--error-unmatch',
        target.relativePath,
      ]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getFileHistory(target: GitCliTarget, maxCount: number = 20): Promise<GitCommitInfo[]> {
    try {
      const format = '%H%x1f%h%x1f%s%x1f%an%x1f%aI%x1e';
      const stdout = await execGitText(target, [
        'log',
        '--follow',
        `--max-count=${maxCount}`,
        `--format=${format}`,
        '--',
        target.relativePath,
      ]);

      if (!stdout.trim()) {
        return [];
      }

      return stdout
        .split('\x1e')
        .filter((record) => record.trim())
        .map((record) => {
          const [hash, shortHash, subject, authorName, date] = record.trim().split('\x1f');
          return {
            hash: hash ?? '',
            shortHash: shortHash ?? '',
            subject: subject ?? '',
            authorName: authorName ?? '',
            date: date ?? '',
          };
        });
    } catch {
      return [];
    }
  }

  async extractFileToPath(target: GitCliTarget, ref: string, outputPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const gitProcess = spawn('git', ['show', `${ref}:${target.relativePath}`], {
        cwd: target.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const fileStream = createWriteStream(outputPath);
      const stderrChunks: Buffer[] = [];

      gitProcess.stdout.pipe(fileStream);
      gitProcess.stderr.on('data', (chunk: Buffer | string) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      fileStream.on('error', (error) => {
        gitProcess.kill();
        reject(new Error(`Failed to write to ${outputPath}: ${error.message}`));
      });

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        reject(
          new Error(`git show ${ref}:${target.relativePath} failed (code ${code}): ${stderr}`),
        );
      });

      gitProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn git: ${error.message}`));
      });
    });
  }
}
