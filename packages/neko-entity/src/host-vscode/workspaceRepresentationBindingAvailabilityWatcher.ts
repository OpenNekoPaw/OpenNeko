import * as vscode from 'vscode';
import type { EntityRepresentationBinding } from '@neko/shared';
import type { CreativeEntityService } from '../core/CreativeEntityService';

export interface WorkspaceRepresentationBindingAvailabilityWatcherOptions {
  readonly projectRoot: string;
  readonly service: CreativeEntityService;
  readonly workspace?: Pick<typeof vscode.workspace, 'createFileSystemWatcher'>;
  readonly debounceMs?: number;
  readonly now?: () => string;
}

export class WorkspaceRepresentationBindingAvailabilityWatcher implements vscode.Disposable {
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly subscriptions: vscode.Disposable[];
  private readonly deletedUriKeys = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: WorkspaceRepresentationBindingAvailabilityWatcherOptions) {
    const workspace = options.workspace ?? vscode.workspace;
    this.watcher = workspace.createFileSystemWatcher(
      new vscode.RelativePattern(options.projectRoot, '**/*'),
    );
    this.subscriptions = [this.watcher.onDidDelete((uri) => this.enqueueDelete(uri))];
  }

  dispose(): void {
    this.disposed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    for (const subscription of this.subscriptions) subscription.dispose();
    this.watcher.dispose();
  }

  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    const deletedUriKeys = new Set(this.deletedUriKeys);
    this.deletedUriKeys.clear();
    if (deletedUriKeys.size === 0) return;

    const orphanedIds = (await this.options.service.bindings.list())
      .filter((binding) =>
        deletedUriKeys.has(bindingWorkspaceUriKey(this.options.projectRoot, binding) ?? ''),
      )
      .filter((binding) => binding.availability !== 'orphaned')
      .map((binding) => binding.id);
    if (orphanedIds.length === 0) return;

    await this.options.service.markBindingsOrphaned({
      bindingIds: orphanedIds,
      orphanedAt: this.options.now?.() ?? new Date().toISOString(),
    });
  }

  private enqueueDelete(uri: vscode.Uri): void {
    if (this.disposed) return;
    this.deletedUriKeys.add(normalizeUriKey(uri));
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flushNow();
    }, this.options.debounceMs ?? 150);
  }
}

function bindingWorkspaceUriKey(
  projectRoot: string,
  binding: EntityRepresentationBinding,
): string | undefined {
  const workspacePath =
    binding.representation.kind === 'workspace-file'
      ? binding.representation.path
      : binding.representation.kind === 'document-entry'
        ? binding.representation.source.path
        : undefined;
  if (!workspacePath) return undefined;
  return normalizeUriKey(vscode.Uri.file(`${projectRoot.replace(/\/+$/u, '')}/${workspacePath}`));
}

function normalizeUriKey(uri: vscode.Uri): string {
  return uri.fsPath || uri.toString();
}
