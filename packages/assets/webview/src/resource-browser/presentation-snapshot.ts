import type {
  ResourceBrowserFacet,
  ResourceBrowserIdentity,
} from '@neko/assets-domain/resource-browser/contract';
import type { EntityInspectorDraft } from '@neko/entity-webview/inspector';

export type ResourceBrowserPresentationIdentity = Pick<
  ResourceBrowserIdentity,
  'projectId' | 'workspaceId'
>;

export interface ResourceBrowserPresentationSnapshot {
  readonly query: string;
  readonly activeFacet: ResourceBrowserFacet;
  readonly viewMode: 'list' | 'grid';
  readonly expandedResourceIds: readonly string[];
  readonly selectedResourceIds: Readonly<Partial<Record<ResourceBrowserFacet, string>>>;
  readonly activeContainerResourceIds: Readonly<Partial<Record<'files' | 'media', string>>>;
  readonly entityDrafts: Readonly<Record<string, EntityInspectorDraft>>;
}

export interface ResourceBrowserPresentationSnapshotStore {
  read(
    identity: ResourceBrowserPresentationIdentity,
  ): ResourceBrowserPresentationSnapshot | undefined;
  write(
    identity: ResourceBrowserPresentationIdentity,
    snapshot: ResourceBrowserPresentationSnapshot | undefined,
  ): void;
  clear(): void;
}

export function createResourceBrowserPresentationSnapshotStore(): ResourceBrowserPresentationSnapshotStore {
  const snapshots = new Map<string, ResourceBrowserPresentationSnapshot>();
  return {
    read(identity) {
      const snapshot = snapshots.get(snapshotKey(identity));
      return snapshot ? cloneSnapshot(snapshot) : undefined;
    },
    write(identity, snapshot) {
      const key = snapshotKey(identity);
      if (!snapshot) {
        snapshots.delete(key);
        return;
      }
      snapshots.set(key, cloneSnapshot(snapshot));
    },
    clear() {
      snapshots.clear();
    },
  };
}

function snapshotKey(identity: ResourceBrowserPresentationIdentity): string {
  if (identity.projectId.length === 0 || identity.workspaceId.length === 0) {
    throw new Error('Resource Browser presentation identity is incomplete.');
  }
  return JSON.stringify([identity.projectId, identity.workspaceId]);
}

function cloneSnapshot(
  snapshot: ResourceBrowserPresentationSnapshot,
): ResourceBrowserPresentationSnapshot {
  return {
    query: snapshot.query,
    activeFacet: snapshot.activeFacet,
    viewMode: snapshot.viewMode,
    expandedResourceIds: [...snapshot.expandedResourceIds],
    selectedResourceIds: { ...snapshot.selectedResourceIds },
    activeContainerResourceIds: { ...snapshot.activeContainerResourceIds },
    entityDrafts: Object.fromEntries(
      Object.entries(snapshot.entityDrafts).map(([resourceId, draft]) => [
        resourceId,
        { ...draft },
      ]),
    ),
  };
}
