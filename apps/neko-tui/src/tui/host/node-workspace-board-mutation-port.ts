import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ProjectFileStore,
  createDefaultProjectFormatCodecRegistry,
  createEmptyCanvasData,
  type CanvasData,
} from '@neko/shared';
import {
  createCanvasWorkspaceBoardRevision,
  type CanvasWorkspaceBoardLoadedDocument,
  type CanvasWorkspaceBoardMutationPort,
} from '@neko-canvas/domain';

export class NodeWorkspaceBoardMutationPort implements CanvasWorkspaceBoardMutationPort {
  private readonly workspaceRoot: string;
  private readonly store = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: {
      readFile: fs.readFile,
      writeFile: async (filePath, content) => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
      },
      deleteFile: fs.unlink,
      renameFile: async (fromPath, toPath) => fs.rename(fromPath, toPath),
    },
  });

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async loadLatest(input: {
    readonly documentUri: string;
    readonly createIfMissing: boolean;
  }): Promise<CanvasWorkspaceBoardLoadedDocument> {
    const filePath = this.resolveDocumentPath(input.documentUri);
    const exists = await fileExists(filePath);
    if (!exists) {
      if (!input.createIfMissing) {
        throw new Error(`Canvas document ${input.documentUri} does not exist.`);
      }
      const canvasData = createEmptyCanvasData('Workspace');
      return {
        documentUri: input.documentUri,
        canvasData,
        revision: createCanvasWorkspaceBoardRevision(canvasData),
        exists: false,
      };
    }
    const loaded = await this.store.load<CanvasData>({ filePath, formatId: 'nkc' });
    if (!loaded.ok || !loaded.document) {
      throw new Error(`Failed to load Canvas document ${input.documentUri}: ${formatDiagnostics(loaded.diagnostics)}`);
    }
    return {
      documentUri: input.documentUri,
      canvasData: loaded.document,
      revision: createCanvasWorkspaceBoardRevision(loaded.document),
      exists: true,
    };
  }

  async saveAtomic(input: {
    readonly documentUri: string;
    readonly expectedRevision: string;
    readonly canvasData: CanvasData;
    readonly assertWriter?: () => Promise<void>;
  }): Promise<{ readonly revision: string }> {
    const current = await this.loadLatest({
      documentUri: input.documentUri,
      createIfMissing: true,
    });
    if (current.revision !== input.expectedRevision) {
      throw new Error(
        `stale-revision: expected Canvas revision ${input.expectedRevision}, received ${current.revision}.`,
      );
    }
    await input.assertWriter?.();
    const saved = await this.store.save({
      filePath: this.resolveDocumentPath(input.documentUri),
      formatId: 'nkc',
      document: input.canvasData,
      saveReason: 'agent-edit',
      indent: 2,
      atomic: true,
    });
    if (!saved.ok || !saved.written) {
      throw new Error(
        `Failed to save Canvas document ${input.documentUri}: ${formatDiagnostics(saved.diagnostics)}`,
      );
    }
    return { revision: createCanvasWorkspaceBoardRevision(input.canvasData) };
  }

  workspaceUri(): string {
    return pathToFileURL(`${this.workspaceRoot}${path.sep}`).toString();
  }

  private resolveDocumentPath(documentUri: string): string {
    const filePath = path.resolve(fileURLToPath(documentUri));
    const relative = path.relative(this.workspaceRoot, filePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Canvas document ${documentUri} is outside the TUI workspace.`);
    }
    return filePath;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

function formatDiagnostics(diagnostics: readonly { readonly message: string }[]): string {
  return diagnostics.map((entry) => entry.message).join('; ') || 'Canvas project file failed.';
}
