import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  CANVAS_WORKSPACE_BOARD_PATH,
  createEmptyCanvasData,
  loadNkc,
  saveNkc,
  type CanvasWorkspaceBoardLoadedDocument,
  type CanvasWorkspaceBoardMutationPort,
} from '@neko/canvas-domain';
import type { NekoHostPorts } from '@neko/host/ports';

export interface WorkspaceBoardNodeMutationOptions {
  readonly workspace: AssetWorkspaceResolution;
  readonly host: Pick<NekoHostPorts, 'files'>;
  readonly createIdentity?: () => string;
}

export class WorkspaceBoardNodeMutation implements CanvasWorkspaceBoardMutationPort {
  private readonly createIdentity: () => string;

  constructor(private readonly options: WorkspaceBoardNodeMutationOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
  }

  async loadLatest(input: {
    readonly documentUri: string;
    readonly createIfMissing: boolean;
  }): Promise<CanvasWorkspaceBoardLoadedDocument> {
    const documentPath = this.requireDocumentPath(input.documentUri);
    try {
      const file = await this.options.host.files.stat(documentPath);
      if (file.type !== 'file') throw new Error('Workspace Board target is not a file.');
    } catch (error) {
      if (!isMissingPathError(error) || !input.createIfMissing) throw error;
      return {
        documentUri: input.documentUri,
        canvasData: createEmptyCanvasData(`${this.options.workspace.displayName} Board`),
        exists: false,
      };
    }
    const loaded = loadNkc(await this.options.host.files.readText(documentPath));
    if (!loaded.validation.valid) {
      throw new Error('Workspace Board document is invalid and was not modified.');
    }
    return { documentUri: input.documentUri, canvasData: loaded.data, exists: true };
  }

  async saveAtomic(input: {
    readonly documentUri: string;
    readonly canvasData: CanvasWorkspaceBoardLoadedDocument['canvasData'];
    readonly assertWriter?: () => Promise<void>;
  }): Promise<void> {
    const documentPath = this.requireDocumentPath(input.documentUri);
    const directory = path.dirname(documentPath);
    const temporaryPath = `${documentPath}.${this.createIdentity()}.tmp`;
    await input.assertWriter?.();
    await this.assertWritablePath(documentPath);
    await this.options.host.files.createDirectory(directory);
    await this.assertWritablePath(documentPath);
    await this.assertWritablePath(temporaryPath);
    try {
      await this.options.host.files.writeText(temporaryPath, saveNkc(input.canvasData));
      await input.assertWriter?.();
      await this.assertWritablePath(documentPath);
      await this.options.host.files.rename(temporaryPath, documentPath);
    } catch (error) {
      await this.options.host.files
        .delete(temporaryPath, { idempotent: true })
        .catch(() => undefined);
      throw error;
    }
  }

  private async assertWritablePath(targetPath: string): Promise<void> {
    const workspacePath = path.resolve(this.options.workspace.workspacePath);
    const relative = path.relative(workspacePath, path.resolve(targetPath));
    const segments = relative.split(path.sep).filter(Boolean);
    let current = workspacePath;
    await assertNotSymbolicLink(current);
    for (const segment of segments) {
      current = path.join(current, segment);
      await assertNotSymbolicLink(current);
    }
  }

  private requireDocumentPath(documentUri: string): string {
    let candidate: string;
    try {
      candidate = fileURLToPath(documentUri);
    } catch {
      throw new Error('Workspace Board mutation requires a local file document URI.');
    }
    const expected = path.resolve(
      this.options.workspace.workspacePath,
      ...CANVAS_WORKSPACE_BOARD_PATH.split('/'),
    );
    if (path.resolve(candidate) !== expected) {
      throw new Error('Workspace Board mutation target does not match the exact Workspace.');
    }
    return expected;
  }
}

async function assertNotSymbolicLink(targetPath: string): Promise<void> {
  try {
    if ((await lstat(targetPath)).isSymbolicLink()) {
      throw new Error('Workspace Board symbolic-link targets are read-only.');
    }
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (Reflect.get(error, 'code') === 'ENOENT' || Reflect.get(error, 'code') === 'ENOTDIR')
  );
}
