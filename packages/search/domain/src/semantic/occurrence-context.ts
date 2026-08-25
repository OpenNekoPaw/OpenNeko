import type { SemanticEntityOccurrenceRecord } from '../contracts';
import type { ContentLocator, DocumentReadResult, DocumentSourceRef } from '@neko/content-domain';
import type { DocumentReadCoordinate, IDocumentAccessService } from '@neko/content-domain/document';

export type SemanticOccurrenceContextErrorCode =
  'semantic-occurrence-context-missing-locator' | 'semantic-occurrence-context-stale';

export class SemanticOccurrenceContextError extends Error {
  constructor(
    readonly code: SemanticOccurrenceContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SemanticOccurrenceContextError';
  }
}

export interface ReadSemanticOccurrenceContextInput {
  readonly record: SemanticEntityOccurrenceRecord;
  readonly source: DocumentSourceRef;
  readonly documentAccess: IDocumentAccessService;
  readonly readFingerprint: () => Promise<string | null>;
}

export async function readSemanticOccurrenceContext(
  input: ReadSemanticOccurrenceContextInput,
): Promise<DocumentReadResult> {
  const locator = input.record.occurrence.locator;
  if (!locator) {
    throw new SemanticOccurrenceContextError(
      'semantic-occurrence-context-missing-locator',
      `Semantic occurrence has no source locator: ${input.record.occurrenceId}`,
    );
  }
  await assertCurrentFingerprint(input);
  const result = await input.documentAccess.readRange(input.source, {
    locator: readCoordinate(locator),
  });
  await assertCurrentFingerprint(input);
  return result;
}

function readCoordinate(locator: ContentLocator): DocumentReadCoordinate {
  const selector = locator.selector;
  if (!selector) {
    throw new SemanticOccurrenceContextError(
      'semantic-occurrence-context-missing-locator',
      'Semantic occurrence ContentLocator has no selector.',
    );
  }
  switch (selector.kind) {
    case 'entry':
      return { kind: 'chapter', chapterHref: selector.path };
    case 'page':
    case 'text-range':
      return selector;
  }
}

async function assertCurrentFingerprint(input: ReadSemanticOccurrenceContextInput): Promise<void> {
  const current = await input.readFingerprint();
  if (current !== input.record.sourceFingerprint) {
    throw new SemanticOccurrenceContextError(
      'semantic-occurrence-context-stale',
      `Semantic occurrence source changed: ${input.record.sourceId}`,
    );
  }
}
