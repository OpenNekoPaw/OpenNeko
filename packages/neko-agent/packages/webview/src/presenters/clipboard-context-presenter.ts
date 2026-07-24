import type {
  AgentContextPayload,
  DocumentArchiveResourceRef,
  DocumentLocator,
} from '@neko/shared';
import { parseDocumentArchiveResourceRef } from '@neko/shared';

export function projectClipboardTextToContextPayload(text: string): AgentContextPayload | null {
  const value = parseJsonObject(text);
  if (!value) return null;

  if (value.kind === 'document-image-reference') {
    return projectDocumentImageReference(value);
  }
  if (value.kind === 'media-library-file-reference') {
    return projectMediaLibraryFileReference(value);
  }
  return null;
}

function projectDocumentImageReference(value: Record<string, unknown>): AgentContextPayload | null {
  const document = asRecord(value.document);
  const image = asRecord(value.image);
  if (!document || !image) return null;

  const source = asRecord(document.source);
  const filePath = readString(document.filePath) ?? readString(source?.filePath);

  const locator = parseDocumentLocator(document.locator);
  const resourceRef =
    parseStableDocumentArchiveResourceRef(image.resourceRef) ??
    parseStableDocumentArchiveResourceRef(document.resourceRef);
  if (!filePath || !resourceRef) return null;

  const label = locator
    ? formatDocumentLocator(locator)
    : resourceRef?.entryPath
      ? basename(resourceRef.entryPath)
      : basename(filePath);
  const sourceFormat = readString(source?.format);
  const data = {
    kind: 'document-image-reference',
    document: {
      filePath,
      ...(source ? { source } : {}),
      ...(locator ? { locator } : {}),
      ...(resourceRef ? { resourceRef } : {}),
    },
    image: {
      ...optionalNumberField('index', image.index),
      ...optionalNumberField('width', image.width),
      ...optionalNumberField('height', image.height),
      ...optionalNumberField('byteSize', image.byteSize),
      ...optionalStringField('mimeType', image.mimeType),
      ...(resourceRef ? { resourceRef } : {}),
    },
    navigationData: {
      source: sourceFormat ?? 'document',
      filePath,
      ...(resourceRef?.entryPath ? { entryPath: resourceRef.entryPath } : {}),
    },
  };

  return {
    type: 'image',
    id: stableContextId('document-image', filePath, resourceRef.entryPath ?? label, label),
    label,
    summary: `Document image: ${basename(filePath)}#${label}`,
    data,
  };
}

function projectMediaLibraryFileReference(
  value: Record<string, unknown>,
): AgentContextPayload | null {
  const path = readString(value.path);
  const resolvedPath = readString(value.resolvedPath) ?? path;
  if (!path || !resolvedPath) return null;

  const mediaType = readString(value.mediaType);
  const label = readString(value.name) ?? basename(resolvedPath);
  const data = {
    kind: 'media-library-file-reference',
    path,
    resolvedPath,
    ...(mediaType ? { mediaType } : {}),
    ...optionalStringField('name', value.name),
    ...(asRecord(value.source) ? { source: asRecord(value.source) } : {}),
    navigationData: {
      source: 'media-library',
      partition: 'media-library',
      portablePath: path,
      filePath: resolvedPath,
    },
  };

  return {
    type: 'media',
    id: stableContextId('media-library-file', path, resolvedPath),
    label,
    summary: mediaType ? `Media: ${label} (${mediaType})` : `Media: ${label}`,
    data,
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return asRecord(parsed) ?? null;
  } catch {
    return null;
  }
}

function parseStableDocumentArchiveResourceRef(
  value: unknown,
): DocumentArchiveResourceRef | undefined {
  const ref = parseDocumentArchiveResourceRef(value);
  if (!ref) return undefined;
  return ref;
}

function parseDocumentLocator(value: unknown): DocumentLocator | undefined {
  const locator = asRecord(value);
  if (!locator) return undefined;

  if (locator.kind === 'page') {
    const pageNumber = readFiniteNumber(locator.pageNumber);
    const pageIndex = readFiniteNumber(locator.pageIndex);
    if (pageNumber === undefined || pageIndex === undefined) return undefined;
    return {
      kind: 'page',
      pageNumber,
      pageIndex,
      ...optionalStringField('entryName', locator.entryName),
    };
  }
  if (locator.kind === 'region') {
    const pageNumber = readFiniteNumber(locator.pageNumber);
    const pageIndex = readFiniteNumber(locator.pageIndex);
    const region = parseRegion(locator.region);
    if (pageNumber === undefined || !region) return undefined;
    return {
      kind: 'region',
      pageNumber,
      region,
      ...(pageIndex !== undefined ? { pageIndex } : {}),
      ...optionalStringField('entryName', locator.entryName),
    };
  }
  if (locator.kind === 'chapter') {
    const chapterHref = readString(locator.chapterHref);
    const spineIndex = readFiniteNumber(locator.spineIndex);
    const title = readString(locator.title);
    if (!chapterHref) return undefined;
    return {
      kind: 'chapter',
      chapterHref,
      ...(spineIndex !== undefined ? { spineIndex } : {}),
      ...(title ? { title } : {}),
      ...optionalStringField('cfi', locator.cfi),
    };
  }
  if (locator.kind === 'slide') {
    const slideNumber = readFiniteNumber(locator.slideNumber);
    const slideIndex = readFiniteNumber(locator.slideIndex);
    if (slideNumber === undefined || slideIndex === undefined) return undefined;
    return { kind: 'slide', slideNumber, slideIndex };
  }
  if (locator.kind === 'text-range') {
    return {
      kind: 'text-range',
      ...optionalNumberField('startChar', locator.startChar),
      ...optionalNumberField('endChar', locator.endChar),
      ...optionalNumberField('startLine', locator.startLine),
      ...optionalNumberField('endLine', locator.endLine),
      ...optionalNumberField('paragraphIndex', locator.paragraphIndex),
      ...optionalStringField('heading', locator.heading),
    };
  }

  return undefined;
}

function parseRegion(
  value: unknown,
): { x: number; y: number; width: number; height: number } | undefined {
  const region = asRecord(value);
  if (!region) return undefined;
  const x = readFiniteNumber(region.x);
  const y = readFiniteNumber(region.y);
  const width = readFiniteNumber(region.width);
  const height = readFiniteNumber(region.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  return { x, y, width, height };
}

function formatDocumentLocator(locator: DocumentLocator): string {
  switch (locator.kind) {
    case 'page':
      return `page:${locator.pageNumber}`;
    case 'region':
      return `page:${locator.pageNumber}:region`;
    case 'chapter':
      return locator.spineIndex !== undefined
        ? `chapter:${locator.chapterHref}@${locator.spineIndex}`
        : `chapter:${locator.chapterHref}`;
    case 'slide':
      return `slide:${locator.slideNumber}`;
    case 'text-range':
      if (locator.startLine !== undefined || locator.endLine !== undefined) {
        return `lines:${locator.startLine ?? '?'}-${locator.endLine ?? '?'}`;
      }
      return `chars:${locator.startChar ?? '?'}-${locator.endChar ?? '?'}`;
  }
}

function stableContextId(...parts: readonly string[]): string {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(':');
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalStringField(key: string, value: unknown): Record<string, string> {
  const text = readString(value);
  return text ? { [key]: text } : {};
}

function optionalNumberField(key: string, value: unknown): Record<string, number> {
  const number = readFiniteNumber(value);
  return number !== undefined ? { [key]: number } : {};
}
