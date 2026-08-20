import { randomUUID } from 'node:crypto';
import { copyFile, link, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import * as path from 'node:path';
import {
  WORKSPACE_ASSET_DIRECTORY,
  assertWorkspaceAssetMaterializationRequest,
  type WorkspaceAssetMaterializationRequest,
  type WorkspaceAssetMaterializationResult,
} from '@neko/assets-domain/global-library';
import {
  assertAssetLibrarySourceRelativePath,
  type AssetLibraryMembershipRepository,
} from '@neko/assets-domain/global-library/membership';

export class WorkspaceAssetMaterializationService {
  constructor(
    private readonly options: {
      readonly globalAssetRoot: string;
      readonly memberships: Pick<AssetLibraryMembershipRepository, 'get'>;
    },
  ) {
    if (!path.isAbsolute(options.globalAssetRoot)) {
      throw new Error('Workspace Asset materialization requires an absolute Asset root.');
    }
  }

  async materialize(input: {
    readonly request: WorkspaceAssetMaterializationRequest;
    readonly workspaceRoot: string;
  }): Promise<WorkspaceAssetMaterializationResult> {
    assertWorkspaceAssetMaterializationRequest(input.request);
    if (!path.isAbsolute(input.workspaceRoot)) {
      throw new Error('Workspace Asset materialization requires an absolute Workspace root.');
    }
    const membership = await this.options.memberships.get(input.request.assetId);
    if (!membership) {
      return unavailable(
        input.request.assetId,
        'asset-membership-missing',
        'The selected Asset no longer exists.',
      );
    }
    if (membership.state !== 'active') {
      return unavailable(
        input.request.assetId,
        'asset-membership-removed',
        'The selected Asset is no longer active.',
      );
    }

    const source = await resolveRegularAssetSource(
      this.options.globalAssetRoot,
      membership.sourceRelativePath,
    );
    if (source.status === 'unavailable') {
      return unavailable(input.request.assetId, source.code, source.message);
    }
    const target = await resolveWorkspaceAssetDirectory(input.workspaceRoot);
    if (target.status === 'unavailable') {
      return unavailable(input.request.assetId, target.code, target.message);
    }

    const parsed = path.parse(path.basename(membership.sourceRelativePath).normalize('NFC'));
    if (!parsed.base || parsed.base === '.' || parsed.base === '..' || parsed.base.includes('\0')) {
      return unavailable(
        input.request.assetId,
        'asset-source-unsupported',
        'The selected Asset has an invalid file name.',
      );
    }

    for (let attempt = 1; attempt <= 1_000; attempt += 1) {
      const label = attempt === 1 ? parsed.base : `${parsed.name} (${attempt})${parsed.ext}`;
      const destination = path.join(target.directory, label);
      const temporary = path.join(target.directory, `.${label}.${randomUUID()}.asset-copy`);
      try {
        await copyFile(source.path, temporary);
        await link(temporary, destination);
        return {
          status: 'materialized',
          assetId: input.request.assetId,
          label,
          contentLocator: {
            file: {
              authority: 'workspace',
              path: `${WORKSPACE_ASSET_DIRECTORY}/${label}`,
            },
          },
        };
      } catch (error: unknown) {
        if (readErrorCode(error) !== 'EEXIST') {
          return unavailable(
            input.request.assetId,
            'workspace-copy-failed',
            'The selected Asset could not be copied into the Workspace.',
          );
        }
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
    }
    return unavailable(
      input.request.assetId,
      'workspace-copy-failed',
      'The Workspace has no available file name for the selected Asset.',
    );
  }
}

async function resolveRegularAssetSource(
  configuredRoot: string,
  sourceRelativePath: string,
): Promise<
  | { readonly status: 'ready'; readonly path: string }
  | {
      readonly status: 'unavailable';
      readonly code:
        'asset-source-missing' | 'asset-source-unauthorized' | 'asset-source-unsupported';
      readonly message: string;
    }
> {
  try {
    assertAssetLibrarySourceRelativePath(sourceRelativePath);
  } catch {
    return {
      status: 'unavailable',
      code: 'asset-source-unauthorized',
      message: 'The selected Asset has an invalid source path.',
    };
  }
  let root: string;
  try {
    root = await realpath(configuredRoot);
  } catch {
    return {
      status: 'unavailable',
      code: 'asset-source-missing',
      message: 'The Asset Library root is unavailable.',
    };
  }
  const candidate = path.resolve(root, ...sourceRelativePath.split('/'));
  if (!isPathInside(candidate, root)) {
    return {
      status: 'unavailable',
      code: 'asset-source-unauthorized',
      message: 'The selected Asset escaped the Asset Library root.',
    };
  }
  try {
    const entry = await lstat(candidate);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      return {
        status: 'unavailable',
        code: 'asset-source-unsupported',
        message: 'The selected Asset must be a regular file.',
      };
    }
    const resolved = await realpath(candidate);
    if (!isPathInside(resolved, root)) {
      return {
        status: 'unavailable',
        code: 'asset-source-unauthorized',
        message: 'The selected Asset resolved outside the Asset Library root.',
      };
    }
    return { status: 'ready', path: resolved };
  } catch (error: unknown) {
    return readErrorCode(error) === 'ENOENT'
      ? {
          status: 'unavailable',
          code: 'asset-source-missing',
          message: 'The selected Asset source file is unavailable.',
        }
      : {
          status: 'unavailable',
          code: 'asset-source-unauthorized',
          message: 'The selected Asset source file could not be authorized.',
        };
  }
}

async function resolveWorkspaceAssetDirectory(configuredRoot: string): Promise<
  | { readonly status: 'ready'; readonly directory: string }
  | {
      readonly status: 'unavailable';
      readonly code: 'workspace-target-unavailable';
      readonly message: string;
    }
> {
  try {
    const workspaceRoot = await realpath(configuredRoot);
    const workspace = await lstat(workspaceRoot);
    if (!workspace.isDirectory()) throw new Error('Workspace root is not a directory.');
    const directory = path.join(workspaceRoot, WORKSPACE_ASSET_DIRECTORY);
    await mkdir(directory, { recursive: true });
    const entry = await lstat(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error('Workspace Asset target is not a regular directory.');
    }
    const resolved = await realpath(directory);
    if (!isPathInside(resolved, workspaceRoot)) {
      throw new Error('Workspace Asset target escaped the Workspace.');
    }
    return { status: 'ready', directory: resolved };
  } catch {
    return {
      status: 'unavailable',
      code: 'workspace-target-unavailable',
      message: 'The Workspace Asset directory is unavailable.',
    };
  }
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : undefined;
}

function unavailable(
  assetId: string,
  code: import('@neko/assets-domain/global-library').WorkspaceAssetMaterializationDiagnosticCode,
  message: string,
): WorkspaceAssetMaterializationResult {
  return { status: 'unavailable', assetId, diagnostic: { code, message } };
}
