import * as vscode from 'vscode';
import { CutDocumentSession, type CutDocumentStorage } from '@neko-cut/domain';
import { NekoEngineCutMediaAdapter } from '../services/NekoEngineCutMediaAdapter';
import { getLogger } from '../base';

const logger = getLogger('CutOtioDocument');

export class VSCodeCutDocumentStorage implements CutDocumentStorage {
  async read(documentUri: string) {
    const uri = vscode.Uri.parse(documentUri);
    const [bytes, stat] = await Promise.all([
      vscode.workspace.fs.readFile(uri),
      vscode.workspace.fs.stat(uri),
    ]);
    return { bytes, version: versionOf(stat) };
  }

  async write(
    documentUri: string,
    bytes: Uint8Array,
    options: { readonly expectedVersion?: string },
  ) {
    const uri = vscode.Uri.parse(documentUri);
    if (options.expectedVersion) {
      const stat = await vscode.workspace.fs.stat(uri);
      if (versionOf(stat) !== options.expectedVersion) {
        throw new Error('OTIO file changed externally before save.');
      }
    }
    const temporary = uri.with({ path: `${uri.path}.${randomId()}.tmp` });
    try {
      await vscode.workspace.fs.writeFile(temporary, bytes);
      await vscode.workspace.fs.rename(temporary, uri, { overwrite: true });
    } catch (error) {
      await vscode.workspace.fs.delete(temporary, { useTrash: false }).then(
        () => undefined,
        () => undefined,
      );
      throw error;
    }
    return { version: versionOf(await vscode.workspace.fs.stat(uri)) };
  }
}

export class CutOtioDocument implements vscode.CustomDocument {
  private readonly disposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.disposeEmitter.event;

  constructor(
    readonly session: CutDocumentSession,
    readonly mediaAdapter: NekoEngineCutMediaAdapter,
  ) {}

  get uri(): vscode.Uri {
    return vscode.Uri.parse(this.session.documentUri);
  }

  dispose(): void {
    void this.mediaAdapter.dispose().catch((error: unknown) => {
      logger.error('Failed to release Cut media sessions while disposing the document.', error);
    });
    this.disposeEmitter.fire();
    this.disposeEmitter.dispose();
  }
}

function versionOf(stat: vscode.FileStat): string {
  return `${stat.mtime}:${stat.size}`;
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
