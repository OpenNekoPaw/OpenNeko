import { MarkdownContractError } from './source-range';

declare const markdownSessionIdBrand: unique symbol;
declare const markdownRevisionBrand: unique symbol;
declare const markdownNodeIdBrand: unique symbol;
declare const markdownAnnotationIdBrand: unique symbol;

export type MarkdownSessionId = string & { readonly [markdownSessionIdBrand]: true };
export type MarkdownRevision = number & { readonly [markdownRevisionBrand]: true };
export type MarkdownNodeId = string & { readonly [markdownNodeIdBrand]: true };
export type MarkdownAnnotationId = string & { readonly [markdownAnnotationIdBrand]: true };

let sessionSequence = 0;

export function createMarkdownSessionId(seed?: string): MarkdownSessionId {
  const value = seed?.trim() || `${Date.now().toString(36)}-${(++sessionSequence).toString(36)}`;
  if (!value) throw new MarkdownContractError('Markdown session ID seed must not be empty.');
  return `md-session:${value}` as MarkdownSessionId;
}

export function createMarkdownRevision(value: number): MarkdownRevision {
  if (!Number.isInteger(value) || value < 1) {
    throw new MarkdownContractError(`Markdown revision must be a positive integer: ${value}`);
  }
  return value as MarkdownRevision;
}

export function createMarkdownNodeId(value: string): MarkdownNodeId {
  if (!value.startsWith('md-node:')) {
    throw new MarkdownContractError(`Invalid Markdown node ID: ${value}`);
  }
  return value as MarkdownNodeId;
}

export function createMarkdownAnnotationId(value: string): MarkdownAnnotationId {
  if (!value.startsWith('md-annotation:')) {
    throw new MarkdownContractError(`Invalid Markdown annotation ID: ${value}`);
  }
  return value as MarkdownAnnotationId;
}

export function deriveMarkdownNodeId(
  sessionId: MarkdownSessionId,
  kind: string,
  startOffset: number,
  endOffset: number,
  sourceSlice: string,
  ordinal: number,
): MarkdownNodeId {
  return createMarkdownNodeId(
    `md-node:${hashIdentity(`${sessionId}\u0000${kind}\u0000${startOffset}\u0000${endOffset}\u0000${ordinal}\u0000${sourceSlice}`)}`,
  );
}

export function deriveMarkdownAnnotationId(
  sessionId: MarkdownSessionId,
  kind: string,
  startOffset: number,
  endOffset: number,
  discriminator: string,
): MarkdownAnnotationId {
  return createMarkdownAnnotationId(
    `md-annotation:${hashIdentity(`${sessionId}\u0000${kind}\u0000${startOffset}\u0000${endOffset}\u0000${discriminator}`)}`,
  );
}

function hashIdentity(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
