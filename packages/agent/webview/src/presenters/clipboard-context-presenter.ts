import type { AgentContextPayload } from '@neko/agent-contracts';
import type { ContentLocator } from '@neko/content';
import { isContentLocator } from '@neko/content';
import { projectContentLocatorPath } from './content-locator-presenter';

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
  if (!hasExactKeys(value, ['kind', 'document', 'image', 'display'])) return null;
  const document = asRecord(value.document);
  const image = asRecord(value.image);
  if (!document || !image) return null;
  if (
    !hasExactKeys(document, ['filePath', 'source', 'contentLocator']) ||
    !hasExactKeys(image, ['index', 'width', 'height', 'byteSize', 'mimeType', 'contentLocator'])
  ) {
    return null;
  }
  const display = value.display === undefined ? undefined : asRecord(value.display);
  if (
    value.display !== undefined &&
    (!display || !hasExactKeys(display, ['runtimeOnly', 'path']))
  ) {
    return null;
  }

  const source = asRecord(document.source);
  const contentLocator =
    parseStableContentLocator(image.contentLocator) ??
    parseStableContentLocator(document.contentLocator);
  if (!contentLocator) return null;
  const label =
    contentLocator.selector?.kind === 'entry'
      ? basename(contentLocator.selector.path)
      : basename(projectContentLocatorPath(contentLocator));
  const sourceFormat = readString(source?.format);
  const contentPath = projectContentLocatorPath(contentLocator);
  const data = {
    kind: 'document-image-reference',
    document: {
      contentLocator,
    },
    image: {
      ...optionalNumberField('index', image.index),
      ...optionalNumberField('width', image.width),
      ...optionalNumberField('height', image.height),
      ...optionalNumberField('byteSize', image.byteSize),
      ...optionalStringField('mimeType', image.mimeType),
      contentLocator,
    },
    navigationData: {
      source: sourceFormat ?? 'document',
      ...(contentLocator.selector?.kind === 'entry'
        ? { entryPath: contentLocator.selector.path }
        : {}),
    },
  };

  return {
    type: 'image',
    id: stableContextId(
      'document-image',
      contentPath,
      contentLocator.selector?.kind === 'entry' ? contentLocator.selector.path : label,
      label,
    ),
    label,
    summary: `Document image: ${basename(contentPath)}#${label}`,
    data,
  };
}

function projectMediaLibraryFileReference(
  value: Record<string, unknown>,
): AgentContextPayload | null {
  const contentLocator = parseStableContentLocator(value.contentLocator);
  if (!contentLocator) return null;

  const mediaType = readString(value.mediaType);
  const contentPath = projectContentLocatorPath(contentLocator);
  const label = readString(value.name) ?? basename(contentPath);
  const data = {
    kind: 'media-library-file-reference',
    contentLocator,
    ...(mediaType ? { mediaType } : {}),
    ...optionalStringField('name', value.name),
    ...(asRecord(value.source) ? { source: asRecord(value.source) } : {}),
    navigationData: {
      source: 'media-library',
      partition: 'media-library',
    },
  };

  return {
    type: 'media',
    id: stableContextId('media-library-file', contentPath),
    label,
    summary: mediaType ? `Media: ${label} (${mediaType})` : `Media: ${label}`,
    data,
  };
}

function parseStableContentLocator(value: unknown): ContentLocator | undefined {
  return isContentLocator(value) ? value : undefined;
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

function hasExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
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
