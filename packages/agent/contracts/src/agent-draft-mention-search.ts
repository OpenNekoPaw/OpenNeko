import { isWorkspaceFileContentLocator, validateContentLocator } from '@neko/content';
import type {
  ProjectFileMentionInfo,
  ProjectMentionExtra,
  ProjectMentionExtraType,
  ProjectMentionMediaType,
  ProjectMentionSource,
} from './webview-protocol';
import {
  parseAgentInputReferenceReceipt,
  type AgentInputReferenceReceipt,
} from './agent-draft-submit';

export type AgentDraftMentionFile = ProjectFileMentionInfo & {
  readonly referenceReceipt: AgentInputReferenceReceipt;
};

export type AgentDraftMentionExtra = ProjectMentionExtra & {
  readonly referenceReceipt: AgentInputReferenceReceipt;
};

export interface AgentDraftMentionSearchProjection {
  readonly bindingReceiptId: string;
  readonly filter: string;
  readonly files: readonly AgentDraftMentionFile[];
  readonly mentionExtras: readonly AgentDraftMentionExtra[];
}

export function parseAgentDraftMentionSearchProjection(
  value: unknown,
): AgentDraftMentionSearchProjection {
  const record = requireRecord(value, 'Agent Draft mention search projection must be an object.');
  requireExactKeys(record, ['bindingReceiptId', 'filter', 'files', 'mentionExtras']);
  if (typeof record['filter'] !== 'string') {
    throw new Error('Agent Draft mention search filter must be a string.');
  }
  if (!Array.isArray(record['files']) || !Array.isArray(record['mentionExtras'])) {
    throw new Error('Agent Draft mention search results must be arrays.');
  }
  return {
    bindingReceiptId: requireIdentity(record['bindingReceiptId'], 'binding receipt'),
    filter: record['filter'],
    files: record['files'].map(parseFile),
    mentionExtras: record['mentionExtras'].map(parseMentionExtra),
  };
}

function parseFile(value: unknown): AgentDraftMentionFile {
  const record = requireRecord(value, 'Agent Draft mention file must be an object.');
  requireSupportedKeys(record, [
    'locator',
    'name',
    'type',
    'icon',
    'source',
    'mediaType',
    'referenceReceipt',
  ]);
  const locatorResult = validateContentLocator(record['locator']);
  if (
    !locatorResult.ok ||
    !isWorkspaceFileContentLocator(locatorResult.locator) ||
    locatorResult.locator.selector !== undefined
  ) {
    throw new Error('Agent Draft mention file requires a project-content locator.');
  }
  if (record['type'] !== 'file' && record['type'] !== 'folder') {
    throw new Error('Agent Draft mention file type is invalid.');
  }
  return {
    locator: locatorResult.locator,
    name: requireIdentity(record['name'], 'file name'),
    type: record['type'],
    ...parseOptionalPresentationFields(record),
    referenceReceipt: parseAgentInputReferenceReceipt(record['referenceReceipt']),
  };
}

function parseMentionExtra(value: unknown): AgentDraftMentionExtra {
  const record = requireRecord(value, 'Agent Draft mention result must be an object.');
  requireSupportedKeys(record, [
    'type',
    'id',
    'label',
    'summary',
    'searchText',
    'thumbnailUri',
    'source',
    'icon',
    'contentLocator',
    'mediaType',
    'entityType',
    'navigationData',
    'referenceReceipt',
  ]);
  const type = parseMentionType(record['type']);
  const contentLocator = record['contentLocator'];
  const locatorResult =
    contentLocator === undefined ? undefined : validateContentLocator(contentLocator);
  if (locatorResult && !locatorResult.ok) {
    throw new Error('Agent Draft mention result content locator is invalid.');
  }
  return {
    type,
    id: requireIdentity(record['id'], 'result'),
    label: requireIdentity(record['label'], 'result label'),
    summary: requireString(record['summary'], 'result summary'),
    ...parseOptionalPresentationFields(record),
    ...optionalString(record, 'searchText'),
    ...optionalString(record, 'thumbnailUri'),
    ...(locatorResult?.ok ? { contentLocator: locatorResult.locator } : {}),
    ...optionalString(record, 'entityType'),
    ...parseNavigationData(record['navigationData']),
    referenceReceipt: parseAgentInputReferenceReceipt(record['referenceReceipt']),
  };
}

function parseOptionalPresentationFields(record: Readonly<Record<string, unknown>>): {
  readonly icon?: string;
  readonly source?: ProjectMentionSource;
  readonly mediaType?: ProjectMentionMediaType;
} {
  const icon = optionalIdentity(record['icon'], 'icon');
  const source = parseOptionalSource(record['source']);
  const mediaType = parseOptionalMediaType(record['mediaType']);
  return {
    ...(icon === undefined ? {} : { icon }),
    ...(source === undefined ? {} : { source }),
    ...(mediaType === undefined ? {} : { mediaType }),
  };
}

function parseMentionType(value: unknown): ProjectMentionExtraType {
  if (
    value !== 'canvas-node' &&
    value !== 'character' &&
    value !== 'scene' &&
    value !== 'asset' &&
    value !== 'media' &&
    value !== 'entity'
  ) {
    throw new Error('Agent Draft mention result type is invalid.');
  }
  return value;
}

function parseOptionalSource(value: unknown): ProjectMentionSource | undefined {
  if (value === undefined) return undefined;
  if (
    value !== 'workspace' &&
    value !== 'media-library' &&
    value !== 'entity-graph' &&
    value !== 'story' &&
    value !== 'canvas'
  ) {
    throw new Error('Agent Draft mention source is invalid.');
  }
  return value;
}

function parseOptionalMediaType(value: unknown): ProjectMentionMediaType | undefined {
  if (value === undefined) return undefined;
  if (
    value !== 'video' &&
    value !== 'audio' &&
    value !== 'image' &&
    value !== 'sequence' &&
    value !== 'text' &&
    value !== 'document'
  ) {
    throw new Error('Agent Draft mention media type is invalid.');
  }
  return value;
}

function parseNavigationData(value: unknown): { readonly navigationData?: Record<string, string> } {
  if (value === undefined) return {};
  const record = requireRecord(value, 'Agent Draft mention navigation data must be an object.');
  const entries = Object.entries(record);
  if (entries.some(([, item]) => typeof item !== 'string')) {
    throw new Error('Agent Draft mention navigation data values must be strings.');
  }
  return { navigationData: Object.fromEntries(entries) as Record<string, string> };
}

function optionalString(
  record: Readonly<Record<string, unknown>>,
  key: 'searchText' | 'thumbnailUri' | 'entityType',
): Record<string, string> {
  const value = record[key];
  if (value === undefined) return {};
  if (typeof value !== 'string') throw new Error(`Agent Draft mention ${key} must be a string.`);
  return { [key]: value };
}

function optionalIdentity(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireIdentity(value, label);
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent Draft mention ${label} is required.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Agent Draft mention ${label} must be a string.`);
  return value;
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error('Agent Draft mention search projection contains unsupported fields.');
  }
}

function requireSupportedKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error('Agent Draft mention search result contains unsupported fields.');
  }
}
