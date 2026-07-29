import type {
  CreativeEntity,
  ContentLocator,
  EntityRepresentationBinding,
  MediaLibraryProjectionEntry,
} from '@neko/shared';
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
    readonly entities: readonly CreativeEntity[];
    readonly bindings: readonly EntityRepresentationBinding[];
  }>;
}

export interface ResourceBrowserProjectionSource {
  readonly files: ResourceBrowserFilesReader;
  readonly media: ResourceBrowserMediaSearch;
  readonly entities: ResourceBrowserEntityReader;
  refresh(identity: ResourceBrowserIdentity): Promise<void>;
}

export interface ResourceBrowserInteractionPort {
  addSource(input: { readonly identity: ResourceBrowserIdentity }): Promise<'added' | 'cancelled'>;
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
      readonly expectedWorkbenchRevision: number;
    };
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
      readonly expectedRevision: number;
    };
  }): Promise<void>;
  addToCut(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly target: {
      readonly viewId: string;
      readonly viewEpoch: number;
      readonly documentId: string;
      readonly sessionId: string;
      readonly expectedRevision: number;
    };
  }): Promise<void>;
}

export interface ResourceBrowserProjectionObserver {
  (projection: ResourceBrowserProjection): void;
}
