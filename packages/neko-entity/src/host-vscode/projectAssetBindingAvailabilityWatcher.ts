import * as vscode from 'vscode';
import type { EntityAssetBinding } from '@neko/shared';
import type { CreativeEntityService } from '../core/CreativeEntityService';

export interface ProjectAssetRefResolution {
  readonly assetRef: string;
  readonly uris: readonly vscode.Uri[];
}

export interface ProjectAssetRefResolver {
  resolveProjectAssetRefs(input: {
    readonly projectRoot: string;
    readonly assetRefs: readonly string[];
  }): Promise<readonly ProjectAssetRefResolution[]>;
}

export interface ProjectAssetBindingAvailabilityWatcherOptions {
  readonly projectRoot: string;
  readonly service: CreativeEntityService;
  readonly resolver: ProjectAssetRefResolver;
  readonly workspace?: Pick<typeof vscode.workspace, 'createFileSystemWatcher'>;
  readonly debounceMs?: number;
  readonly now?: () => string;
}

type WatcherEventKind = 'delete' | 'create';

interface QueuedWatcherEvent {
  readonly kind: WatcherEventKind;
  readonly uriKey: string;
}

export class ProjectAssetBindingAvailabilityWatcher implements vscode.Disposable {
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly subscriptions: vscode.Disposable[];
  private readonly queue = new Map<string, QueuedWatcherEvent>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: ProjectAssetBindingAvailabilityWatcherOptions) {
    const workspace = options.workspace ?? vscode.workspace;
    this.watcher = workspace.createFileSystemWatcher(
      new vscode.RelativePattern(options.projectRoot, '**/*'),
    );
    this.subscriptions = [
      this.watcher.onDidDelete((uri) => this.enqueue('delete', uri)),
      this.watcher.onDidCreate((uri) => this.enqueue('create', uri)),
    ];
  }

  dispose(): void {
    this.disposed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.watcher.dispose();
  }

  async flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    const events = [...this.queue.values()];
    this.queue.clear();
    if (events.length === 0) return;

    const projectBindings = (await this.options.service.bindings.list()).filter((binding) =>
      isProjectBinding(binding),
    );
    if (projectBindings.length === 0) return;

    const resolutions = await this.options.resolver.resolveProjectAssetRefs({
      projectRoot: this.options.projectRoot,
      assetRefs: [...new Set(projectBindings.map((binding) => binding.assetRef))],
    });
    const bindingsByUriKey = indexBindingsByResolvedUri(projectBindings, resolutions);
    const orphanedIds = new Set<string>();
    const restoredIds = new Set<string>();

    for (const event of events) {
      const bindings = bindingsByUriKey.get(event.uriKey) ?? [];
      for (const binding of bindings) {
        if (event.kind === 'delete' && binding.availability !== 'orphaned') {
          orphanedIds.add(binding.id);
          restoredIds.delete(binding.id);
        }
        if (event.kind === 'create' && binding.availability === 'orphaned') {
          restoredIds.add(binding.id);
          orphanedIds.delete(binding.id);
        }
      }
    }

    if (orphanedIds.size > 0) {
      await this.options.service.markBindingsOrphaned({
        bindingIds: [...orphanedIds],
        orphanedAt: this.options.now?.() ?? new Date().toISOString(),
      });
    }
    if (restoredIds.size > 0) {
      await this.options.service.restoreOrphanedBindings({
        bindingIds: [...restoredIds],
      });
    }
  }

  private enqueue(kind: WatcherEventKind, uri: vscode.Uri): void {
    if (this.disposed) return;
    const uriKey = normalizeUriKey(uri);
    this.queue.set(uriKey, { kind, uriKey });
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flushNow();
    }, this.options.debounceMs ?? 150);
  }
}

export class CommandProjectAssetRefResolver implements ProjectAssetRefResolver {
  constructor(
    private readonly executeCommand: typeof vscode.commands.executeCommand = vscode.commands
      .executeCommand,
  ) {}

  async resolveProjectAssetRefs(input: {
    readonly projectRoot: string;
    readonly assetRefs: readonly string[];
  }): Promise<readonly ProjectAssetRefResolution[]> {
    const result = await this.executeCommand<unknown>('neko.assets.resolveProjectAssetRefs', input);
    return isProjectAssetRefResolutionArray(result) ? result : [];
  }
}

export interface AssetFederationAvailabilityRefresh {
  readonly assetRef: string;
  readonly availability: 'available' | 'unavailable';
}

export function isFederatedAssetRef(assetRef: string): boolean {
  return (
    assetRef.startsWith('market://') ||
    assetRef.startsWith('shared://') ||
    assetRef.startsWith('external://')
  );
}

function isProjectBinding(binding: EntityAssetBinding): boolean {
  return binding.assetRef.startsWith('project://');
}

function indexBindingsByResolvedUri(
  bindings: readonly EntityAssetBinding[],
  resolutions: readonly ProjectAssetRefResolution[],
): Map<string, EntityAssetBinding[]> {
  const bindingsByAssetRef = new Map<string, EntityAssetBinding[]>();
  for (const binding of bindings) {
    const current = bindingsByAssetRef.get(binding.assetRef) ?? [];
    current.push(binding);
    bindingsByAssetRef.set(binding.assetRef, current);
  }

  const byUri = new Map<string, EntityAssetBinding[]>();
  for (const resolution of resolutions) {
    const matchedBindings = bindingsByAssetRef.get(resolution.assetRef) ?? [];
    if (matchedBindings.length === 0) continue;
    for (const uri of resolution.uris) {
      const key = normalizeUriKey(uri);
      byUri.set(key, [...(byUri.get(key) ?? []), ...matchedBindings]);
    }
  }
  return byUri;
}

function normalizeUriKey(uri: vscode.Uri): string {
  return uri.fsPath || uri.toString();
}

function isProjectAssetRefResolutionArray(
  value: unknown,
): value is readonly ProjectAssetRefResolution[] {
  return Array.isArray(value) && value.every(isProjectAssetRefResolution);
}

function isProjectAssetRefResolution(value: unknown): value is ProjectAssetRefResolution {
  if (!isRecord(value)) return false;
  return (
    typeof value['assetRef'] === 'string' &&
    Array.isArray(value['uris']) &&
    value['uris'].every(isUriLike)
  );
}

function isUriLike(value: unknown): value is vscode.Uri {
  return (
    isRecord(value) &&
    typeof value['scheme'] === 'string' &&
    typeof value['fsPath'] === 'string' &&
    typeof value['toString'] === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
