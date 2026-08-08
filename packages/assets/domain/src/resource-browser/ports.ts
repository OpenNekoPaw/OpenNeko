import type {
  ProjectEntityInspectorIntent,
  ProjectEntityInspectorOwnerCapabilities,
  ProjectEntityDiagnostic,
  ProjectEntityManagementProjection,
} from '@neko/entity-domain';
import type { ContentLocator } from '@neko/content';
import type { GlobalAssetItem } from '../global-library/contract';
import type {
  MediaLibraryProjectionEntry,
  WorkspaceMediaLibraryStatus,
} from '@neko/assets-domain/contracts';
import type {
  ResourceBrowserContentItem,
  ResourceBrowserIdentity,
  ResourceBrowserItem,
  ResourceBrowserProjection,
  ResourceBrowserThumbnailDescriptor,
} from './contract';

export type ResourceBrowserContentRole = 'directory' | 'library-root' | 'content';

export interface ResourceBrowserContentEntry extends MediaLibraryProjectionEntry {
  readonly role: ResourceBrowserContentRole;
  readonly parentLocator?: ContentLocator;
  readonly depth: number;
  readonly libraryName?: string;
  readonly libraryStatus?: WorkspaceMediaLibraryStatus;
}

export interface ResourceBrowserFilesReader {
  list(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly query: string;
    readonly limit: number;
  }): Promise<readonly ResourceBrowserContentEntry[]>;
  children(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly parent: ResourceBrowserContentItem;
    readonly limit: number;
  }): Promise<readonly ResourceBrowserContentEntry[]>;
}

export interface ResourceBrowserMediaSearch {
  search(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly query: string;
    readonly limit: number;
  }): Promise<readonly ResourceBrowserContentEntry[]>;
  children(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly parent: ResourceBrowserContentItem;
    readonly limit: number;
  }): Promise<readonly ResourceBrowserContentEntry[]>;
}

export interface ResourceBrowserEntityReader {
  list(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly query: string;
    readonly limit: number;
  }): Promise<{
    readonly projections: readonly ProjectEntityManagementProjection[];
    readonly diagnostics?: readonly ProjectEntityDiagnostic[];
    readonly inspectorCapabilities?: readonly {
      readonly projectionId: string;
      readonly capabilities: ProjectEntityInspectorOwnerCapabilities;
    }[];
  }>;
}

export interface ResourceBrowserAssetReader {
  list(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly query: string;
    readonly limit: number;
  }): Promise<readonly GlobalAssetItem[]>;
}

export interface ResourceBrowserProjectionSource {
  readonly files: ResourceBrowserFilesReader;
  readonly media: ResourceBrowserMediaSearch;
  readonly assets: ResourceBrowserAssetReader;
  readonly entities: ResourceBrowserEntityReader;
  refresh(identity: ResourceBrowserIdentity): Promise<void>;
}

export interface ResourceBrowserInteractionPort {
  createDirectory(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly parent?: ResourceBrowserContentItem;
    readonly name: string;
  }): Promise<void>;
  importFiles(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly parent?: ResourceBrowserContentItem;
  }): Promise<'imported' | 'cancelled'>;
  trashContent(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserContentItem;
  }): Promise<void>;
  manageEntity(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: Extract<ResourceBrowserItem, { readonly facet: 'entities' }>;
    readonly intent: ProjectEntityInspectorIntent;
  }): Promise<void>;
  linkGlobalLibrary(input: {
    readonly identity: ResourceBrowserIdentity;
  }): Promise<'linked' | 'cancelled'>;
  addDirectoryLibrary(input: {
    readonly identity: ResourceBrowserIdentity;
  }): Promise<'added' | 'cancelled'>;
  relinkSource(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
  }): Promise<'relinked' | 'cancelled'>;
  removeSource(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
  }): Promise<void>;
  preview(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly target: {
      readonly viewId: string;
      readonly presentation: 'temporary' | 'side';
    };
  }): Promise<void>;
  editText(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserContentItem;
  }): Promise<void>;
  openCut(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
  }): Promise<void>;
  reveal(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
  }): Promise<void>;
  resolveThumbnail(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly descriptor: ResourceBrowserThumbnailDescriptor;
  }): Promise<string>;
  addToCanvas(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly target: {
      readonly documentId: string;
      readonly sessionId: string;
    };
  }): Promise<void>;
  addToCut(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly target: {
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly documentId: string;
      readonly sessionId: string;
    };
  }): Promise<void>;
}

export interface ResourceBrowserProjectionObserver {
  (projection: ResourceBrowserProjection): void;
}
