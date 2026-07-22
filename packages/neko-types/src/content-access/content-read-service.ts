import {
  ContentIoContractError,
  assertContentLocator,
  assertContentReadOptions,
  isContentBytes,
  isContentStat,
  type ContentBytes,
  type ContentIoDiagnosticCode,
  type ContentReadOptions,
  type ContentReadService,
  type ContentStat,
} from '../types/content-io';
import {
  contentLocatorsEqual,
  type ContentFingerprint,
  type ContentLocator,
  type DocumentEntryContentLocator,
  type GeneratedOutputContentLocator,
  type PackageResourceContentLocator,
  type WorkspaceFileContentLocator,
} from '../types/content-locator';

export interface ContentReadHandler<TLocator extends ContentLocator> {
  stat(locator: TLocator, options: ContentReadOptions): Promise<ContentStat>;
  read(locator: TLocator, options: ContentReadOptions): Promise<ContentBytes>;
}

export interface ContentReadHandlers {
  readonly workspaceFile: ContentReadHandler<WorkspaceFileContentLocator>;
  readonly documentEntry: ContentReadHandler<DocumentEntryContentLocator>;
  readonly generatedOutput: ContentReadHandler<GeneratedOutputContentLocator>;
  readonly packageResource: ContentReadHandler<PackageResourceContentLocator>;
}

export class ExplicitContentReadService implements ContentReadService {
  constructor(private readonly handlers: ContentReadHandlers) {}

  async stat(
    locatorValue: ContentLocator,
    optionsValue: ContentReadOptions = {},
  ): Promise<ContentStat> {
    const locator = assertContentLocator(locatorValue);
    const options = assertContentReadOptions(optionsValue);
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');

    const result = await this.dispatchStat(locator, options);
    assertHandlerResult(locator, result, isContentStat);
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    return result.status === 'ready' &&
      !fingerprintPreconditionMatches(locator, result.fingerprint, options)
      ? unavailable(locator, 'content-changed')
      : result;
  }

  async read(
    locatorValue: ContentLocator,
    optionsValue: ContentReadOptions = {},
  ): Promise<ContentBytes> {
    const locator = assertContentLocator(locatorValue);
    const options = assertContentReadOptions(optionsValue);
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');

    const result = await this.dispatchRead(locator, options);
    assertHandlerResult(locator, result, isContentBytes);
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    if (result.status === 'ready') {
      if (options.maxBytes !== undefined && result.bytes.byteLength > options.maxBytes) {
        return unavailable(locator, 'content-too-large');
      }
      if (
        options.range &&
        (result.offset !== options.range.offset || result.bytes.byteLength > options.range.length)
      ) {
        throw invalidHandlerResult(
          'Content read handler returned bytes outside the requested range.',
        );
      }
    }
    return result.status === 'ready' &&
      !fingerprintPreconditionMatches(locator, result.fingerprint, options)
      ? unavailable(locator, 'content-changed')
      : result;
  }

  private dispatchStat(locator: ContentLocator, options: ContentReadOptions): Promise<ContentStat> {
    switch (locator.kind) {
      case 'workspace-file':
        return this.handlers.workspaceFile.stat(locator, options);
      case 'document-entry':
        return this.handlers.documentEntry.stat(locator, options);
      case 'generated-output':
        return this.handlers.generatedOutput.stat(locator, options);
      case 'package-resource':
        return this.handlers.packageResource.stat(locator, options);
    }
  }

  private dispatchRead(
    locator: ContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentBytes> {
    switch (locator.kind) {
      case 'workspace-file':
        return this.handlers.workspaceFile.read(locator, options);
      case 'document-entry':
        return this.handlers.documentEntry.read(locator, options);
      case 'generated-output':
        return this.handlers.generatedOutput.read(locator, options);
      case 'package-resource':
        return this.handlers.packageResource.read(locator, options);
    }
  }
}

function fingerprintPreconditionMatches(
  locator: ContentLocator,
  actual: ContentFingerprint,
  options: ContentReadOptions,
): boolean {
  const expected = options.expectedFingerprint ?? locatorFingerprintPrecondition(locator);
  return expected === undefined || fingerprintsEqual(expected, actual);
}

function assertHandlerResult<T extends ContentStat | ContentBytes>(
  locator: ContentLocator,
  result: unknown,
  guard: (value: unknown) => value is T,
): asserts result is T {
  if (!guard(result) || !contentLocatorsEqual(locator, result.locator)) {
    throw invalidHandlerResult('Content read handler returned an invalid result.');
  }
}

function locatorFingerprintPrecondition(locator: ContentLocator): ContentFingerprint | undefined {
  switch (locator.kind) {
    case 'workspace-file':
      return locator.fingerprint;
    case 'document-entry':
      return locator.fingerprint;
    case 'generated-output':
      return { strategy: 'sha256', value: locator.digest };
    case 'package-resource':
      return locator.digest ? { strategy: 'sha256', value: locator.digest } : undefined;
  }
}

function fingerprintsEqual(left: ContentFingerprint, right: ContentFingerprint): boolean {
  return left.strategy === right.strategy && left.value === right.value;
}

function unavailable(
  locator: ContentLocator,
  code: Extract<
    ContentIoDiagnosticCode,
    'content-cancelled' | 'content-changed' | 'content-too-large'
  >,
): Extract<ContentStat, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}

function invalidHandlerResult(message: string): ContentIoContractError {
  return new ContentIoContractError('invalid-content-handler-result', message);
}
