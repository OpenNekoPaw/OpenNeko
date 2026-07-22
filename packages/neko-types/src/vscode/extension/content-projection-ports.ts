import {
  ContentIoContractError,
  assertContentLocator,
  isContentProjectionOptions,
  type ContentIoDiagnostic,
  type ContentLocator,
  type ContentProjectionOptions,
  type ContentReadService,
  type EngineContentProjection,
  type EngineContentProjectionPort,
  type ProcessorContentProjection,
  type ProcessorContentProjectionPort,
  type WebviewContentProjection,
  type WebviewContentProjectionPort,
} from '../../types';

export interface HostOpaqueContentProjectionResolver {
  resolve(locator: ContentLocator, options: ContentProjectionOptions): Promise<string | undefined>;
}

export interface HostContentProjectionPortOptions {
  readonly contentRead: ContentReadService;
  readonly resolver: HostOpaqueContentProjectionResolver;
}

export class HostWebviewContentProjectionPort implements WebviewContentProjectionPort {
  constructor(private readonly options: HostContentProjectionPortOptions) {}

  async project(
    locatorValue: ContentLocator,
    optionsValue: ContentProjectionOptions = {},
  ): Promise<WebviewContentProjection> {
    const result = await projectOpaqueContent(this.options, locatorValue, optionsValue);
    return result.status === 'ready'
      ? { status: 'ready', kind: 'webview', locator: result.locator, uri: result.opaque }
      : result;
  }
}

export class HostEngineContentProjectionPort implements EngineContentProjectionPort {
  constructor(private readonly options: HostContentProjectionPortOptions) {}

  async project(
    locatorValue: ContentLocator,
    optionsValue: ContentProjectionOptions = {},
  ): Promise<EngineContentProjection> {
    const result = await projectOpaqueContent(this.options, locatorValue, optionsValue);
    return result.status === 'ready'
      ? { status: 'ready', kind: 'engine', locator: result.locator, token: result.opaque }
      : result;
  }
}

export class HostProcessorContentProjectionPort implements ProcessorContentProjectionPort {
  constructor(private readonly options: HostContentProjectionPortOptions) {}

  async project(
    locatorValue: ContentLocator,
    optionsValue: ContentProjectionOptions = {},
  ): Promise<ProcessorContentProjection> {
    const result = await projectOpaqueContent(this.options, locatorValue, optionsValue);
    return result.status === 'ready'
      ? { status: 'ready', kind: 'processor', locator: result.locator, handle: result.opaque }
      : result;
  }
}

type OpaqueProjectionResult =
  | {
      readonly status: 'ready';
      readonly locator: ContentLocator;
      readonly opaque: string;
    }
  | {
      readonly status: 'unavailable';
      readonly locator: ContentLocator;
      readonly diagnostic: ContentIoDiagnostic;
    };

async function projectOpaqueContent(
  host: HostContentProjectionPortOptions,
  locatorValue: ContentLocator,
  optionsValue: ContentProjectionOptions,
): Promise<OpaqueProjectionResult> {
  const locator = assertContentLocator(locatorValue);
  if (!isContentProjectionOptions(optionsValue)) {
    throw new ContentIoContractError(
      'invalid-content-projection-options',
      'Content projection options are invalid.',
    );
  }
  if (optionsValue.signal?.aborted) return unavailable(locator, 'content-cancelled');

  const source = await host.contentRead.stat(locator, {
    ...(optionsValue.expectedFingerprint
      ? { expectedFingerprint: optionsValue.expectedFingerprint }
      : {}),
    ...(optionsValue.signal ? { signal: optionsValue.signal } : {}),
  });
  if (source.status === 'unavailable') return source;
  if (optionsValue.signal?.aborted) return unavailable(locator, 'content-cancelled');

  let opaque: string | undefined;
  try {
    opaque = await host.resolver.resolve(locator, optionsValue);
  } catch {
    return unavailable(locator, 'content-projection-failed');
  }
  if (optionsValue.signal?.aborted) return unavailable(locator, 'content-cancelled');
  if (!opaque || exposesHostPhysicalPath(opaque)) {
    return unavailable(locator, 'content-projection-failed');
  }
  return { status: 'ready', locator, opaque };
}

function exposesHostPhysicalPath(value: string): boolean {
  const normalized = value.replace(/\\/gu, '/');
  return (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.startsWith('file:') ||
    normalized.includes('/.neko/.cache/') ||
    normalized.endsWith('/.neko/.cache')
  );
}

function unavailable(
  locator: ContentLocator,
  code: ContentIoDiagnostic['code'],
): Extract<OpaqueProjectionResult, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}
