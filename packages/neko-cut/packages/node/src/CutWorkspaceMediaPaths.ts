import * as nodePath from 'node:path';
import * as nodeFs from 'node:fs/promises';
import type { OtioTimeline } from '@neko-cut/domain';

export type CutResolvedMediaPath =
  | {
      readonly status: 'available';
      readonly workspaceRelativePath: string;
      readonly filePath: string;
    }
  | {
      readonly status: 'missing';
      readonly workspaceRelativePath: string;
      readonly filePath: string;
      readonly diagnostic: 'missing-media';
    };

export class CutMediaPathError extends Error {
  readonly code: 'invalid-path' | 'workspace-escape' | 'symlink-escape';

  constructor(code: CutMediaPathError['code'], message: string) {
    super(message);
    this.name = 'CutMediaPathError';
    this.code = code;
  }
}

export interface CutMediaPathFileSystem {
  realpath(filePath: string): Promise<string>;
}

const nodeFileSystem: CutMediaPathFileSystem = {
  realpath: (filePath) => nodeFs.realpath(filePath),
};

export class CutWorkspaceMediaPaths {
  private constructor(
    private readonly workspaceRoot: string,
    private readonly realWorkspaceRoot: string,
    private readonly fileSystem: CutMediaPathFileSystem,
  ) {}

  static async create(
    workspaceRoot: string,
    fileSystem: CutMediaPathFileSystem = nodeFileSystem,
  ): Promise<CutWorkspaceMediaPaths> {
    const realWorkspaceRoot = await fileSystem.realpath(nodePath.resolve(workspaceRoot));
    return new CutWorkspaceMediaPaths(
      nodePath.resolve(workspaceRoot),
      nodePath.resolve(realWorkspaceRoot),
      fileSystem,
    );
  }

  async linkMedia(documentPath: string, workspaceRelativePath: string): Promise<string> {
    const normalizedWorkspacePath = normalizeWorkspaceRelativePath(workspaceRelativePath);
    const candidate = nodePath.resolve(this.workspaceRoot, ...normalizedWorkspacePath.split('/'));
    assertContained(this.workspaceRoot, candidate, 'workspace-escape');
    const realCandidate = nodePath.resolve(await this.fileSystem.realpath(candidate));
    assertContained(this.realWorkspaceRoot, realCandidate, 'symlink-escape');
    const documentDirectory = await this.resolveDocumentDirectory(documentPath);
    return normalizeOtioRelativePath(nodePath.relative(documentDirectory, realCandidate));
  }

  async resolveTarget(documentPath: string, targetUrl: string): Promise<CutResolvedMediaPath> {
    validateOtioRelativeTarget(targetUrl);
    const documentDirectory = await this.resolveDocumentDirectory(documentPath);
    const candidate = nodePath.resolve(documentDirectory, ...targetUrl.split('/'));
    assertContained(this.realWorkspaceRoot, candidate, 'workspace-escape');
    try {
      const realCandidate = nodePath.resolve(await this.fileSystem.realpath(candidate));
      assertContained(this.realWorkspaceRoot, realCandidate, 'symlink-escape');
      return {
        status: 'available',
        workspaceRelativePath: toWorkspaceRelative(this.realWorkspaceRoot, realCandidate),
        filePath: realCandidate,
      };
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      const safeCandidate = await this.resolveMissingCandidate(candidate);
      return {
        status: 'missing',
        workspaceRelativePath: toWorkspaceRelative(this.realWorkspaceRoot, safeCandidate),
        filePath: safeCandidate,
        diagnostic: 'missing-media',
      };
    }
  }

  async rebaseDocument(
    document: OtioTimeline,
    oldDocumentPath: string,
    newDocumentPath: string,
  ): Promise<OtioTimeline> {
    const newDocumentDirectory = await this.resolveDocumentDirectory(newDocumentPath);
    const tracks = [];
    for (const track of document.tracks.children) {
      const items = [];
      for (const item of track.children) {
        if (item.OTIO_SCHEMA !== 'Clip.2') {
          items.push(item);
          continue;
        }
        const resolved = await this.resolveTarget(oldDocumentPath, item.media_reference.target_url);
        items.push({
          ...item,
          media_reference: {
            ...item.media_reference,
            target_url: normalizeOtioRelativePath(
              nodePath.relative(newDocumentDirectory, resolved.filePath),
            ),
          },
        });
      }
      tracks.push({ ...track, children: items });
    }
    return { ...document, tracks: { ...document.tracks, children: tracks } };
  }

  resolveDefaultProjectPath(configuredRoot: string, projectName: string): string {
    const root = normalizeWorkspaceRelativePath(configuredRoot);
    const safeName = projectName.trim();
    if (!safeName || safeName.includes('/') || safeName.includes('\\')) {
      throw new CutMediaPathError('invalid-path', 'Project name must be one path segment.');
    }
    const fileName = safeName.endsWith('.otio') ? safeName : `${safeName}.otio`;
    const target = nodePath.resolve(this.workspaceRoot, ...root.split('/'), fileName);
    assertContained(this.workspaceRoot, target, 'workspace-escape');
    return target;
  }

  private async resolveDocumentDirectory(documentPath: string): Promise<string> {
    const lexicalDirectory = nodePath.dirname(nodePath.resolve(documentPath));
    assertContained(this.workspaceRoot, lexicalDirectory, 'workspace-escape');
    const realDirectory = nodePath.resolve(await this.fileSystem.realpath(lexicalDirectory));
    assertContained(this.realWorkspaceRoot, realDirectory, 'symlink-escape');
    return realDirectory;
  }

  private async resolveMissingCandidate(candidate: string): Promise<string> {
    const missingSegments: string[] = [];
    let existing = candidate;
    while (existing !== nodePath.dirname(existing)) {
      try {
        const realExisting = nodePath.resolve(await this.fileSystem.realpath(existing));
        assertContained(this.realWorkspaceRoot, realExisting, 'symlink-escape');
        const resolved = nodePath.resolve(realExisting, ...missingSegments.reverse());
        assertContained(this.realWorkspaceRoot, resolved, 'symlink-escape');
        return resolved;
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
        missingSegments.push(nodePath.basename(existing));
        existing = nodePath.dirname(existing);
      }
    }
    throw new CutMediaPathError('workspace-escape', 'Media path has no authorized ancestor.');
  }
}

function validateOtioRelativeTarget(value: string): void {
  if (
    value.length === 0 ||
    value.includes('\\') ||
    nodePath.posix.isAbsolute(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    throw new CutMediaPathError(
      'invalid-path',
      'OTIO ExternalReference must be a non-empty POSIX relative path.',
    );
  }
}

function normalizeWorkspaceRelativePath(value: string): string {
  validateOtioRelativeTarget(value);
  const normalized = nodePath.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new CutMediaPathError(
      'workspace-escape',
      'Workspace-relative path escapes the workspace.',
    );
  }
  return normalized.replace(/^\.\//, '');
}

function normalizeOtioRelativePath(value: string): string {
  const normalized = value.split(nodePath.sep).join('/');
  return normalized.length === 0 ? '.' : normalized;
}

function toWorkspaceRelative(workspaceRoot: string, filePath: string): string {
  assertContained(workspaceRoot, filePath, 'workspace-escape');
  return normalizeOtioRelativePath(nodePath.relative(workspaceRoot, filePath));
}

function assertContained(
  root: string,
  candidate: string,
  code: 'workspace-escape' | 'symlink-escape',
): void {
  const relative = nodePath.relative(root, candidate);
  if (
    relative === '..' ||
    relative.startsWith(`..${nodePath.sep}`) ||
    nodePath.isAbsolute(relative)
  ) {
    throw new CutMediaPathError(code, `Path escapes the authorized workspace: ${candidate}`);
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
