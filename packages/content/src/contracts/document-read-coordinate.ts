import type { ContentPageSelector, ContentTextRangeSelector } from './content-locator';

export interface DocumentRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DocumentPageCoordinate extends ContentPageSelector {
  readonly entryName?: string;
}

export interface DocumentChapterCoordinate {
  readonly kind: 'chapter';
  readonly chapterHref: string;
  readonly spineIndex?: number;
  readonly title?: string;
  readonly cfi?: string;
}

export interface DocumentSlideCoordinate {
  readonly kind: 'slide';
  readonly slideNumber: number;
  readonly slideIndex: number;
}

export type DocumentTextRangeCoordinate = ContentTextRangeSelector;

export interface DocumentRegionCoordinate {
  readonly kind: 'region';
  readonly pageNumber: number;
  readonly pageIndex?: number;
  readonly entryName?: string;
  readonly region: DocumentRegion;
}

/** Transient decoder position. It is not a content address or transferable identity. */
export type DocumentReadCoordinate =
  | DocumentPageCoordinate
  | DocumentChapterCoordinate
  | DocumentSlideCoordinate
  | DocumentTextRangeCoordinate
  | DocumentRegionCoordinate;
