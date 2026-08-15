import type { ContentLocator } from '@neko/content';
import type { GlobalAssetItem } from '../global-library/contract';
import type { MediaLibraryProjectionEntry } from '@neko/assets-domain/contracts';
import type {
  ResourceBrowserContentItem,
  ResourceBrowserMediaLibraryRootItem,
  ResourceBrowserIdentity,
  ResourceBrowserItem,
  ResourceBrowserMediaLibraryStatus,
  ResourceBrowserProjection,
  ResourceBrowserDiagnostic,
  ResourceBrowserThumbnailDescriptor,
} from './contract';

export type ResourceBrowserContentRole = 'directory' | 'library-root' | 'content';

export interface ResourceBrowserContentEntry extends MediaLibraryProjectionEntry {
  readonly role: Exclude<ResourceBrowserContentRole, 'library-root'>;
  readonly parentLocator?: ContentLocator;
  readonly depth: number;
  readonly libraryName?: string;
}

export interface ResourceBrowserMediaLibraryRootEntry {
  readonly label: string;
  readonly description?: string;
  readonly role: 'library-root';
  readonly depth: 0;
  readonly libraryName: string;
  readonly libraryStatus: ResourceBrowserMediaLibraryStatus;
}

export type ResourceBrowserMediaEntry =
  ResourceBrowserContentEntry | ResourceBrowserMediaLibraryRootEntry;

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
  }): Promise<readonly ResourceBrowserMediaEntry[]>;
  children(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly parent: ResourceBrowserContentItem | ResourceBrowserMediaLibraryRootItem;
    readonly limit: number;
  }): Promise<readonly ResourceBrowserMediaEntry[]>;
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
  refresh(identity: ResourceBrowserIdentity): Promise<void>;
}

export interface ResourceBrowserInteractionPort {
  createCreativeDocument(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly parent?: ResourceBrowserContentItem;
    readonly kind: 'canvas' | 'cut';
    readonly name: string;
  }): Promise<
    | { readonly status: 'opened' }
    | { readonly status: 'created'; readonly diagnostic: ResourceBrowserDiagnostic }
  >;
  createFile(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly parent?: ResourceBrowserContentItem;
    readonly name: string;
  }): Promise<void>;
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
  openCreativeDocument(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserContentItem;
  }): Promise<void>;
  editText(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserContentItem;
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
