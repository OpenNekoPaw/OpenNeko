import type {
  ContentAccessDiagnostic,
  ContentAccessProvider,
  ContentAccessRequest,
  ContentAccessResult,
  ContentAccessStatus,
  ContentIngestProvider,
  ContentIngestRequest,
  ContentIngestResult,
} from '../../types/content-access';
import {
  validateContentAccessRequest,
  validateContentIngestRequest,
  validateContentIngestResult,
} from '../../types/content-access';

export interface ContentAccessLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

export interface ContentAccessService {
  registerProvider(provider: ContentAccessProvider): void;
  resolve(request: ContentAccessRequest): Promise<ContentAccessResult>;
}

export interface ContentIngestService {
  registerProvider(provider: ContentIngestProvider): void;
  ingest(request: ContentIngestRequest): Promise<ContentIngestResult>;
}

export interface ContentAccessServiceOptions {
  readonly providers?: readonly ContentAccessProvider[];
  readonly logger?: ContentAccessLogger;
}

export interface ContentIngestServiceOptions {
  readonly providers?: readonly ContentIngestProvider[];
  readonly logger?: ContentAccessLogger;
  readonly guardOptions?: ContentIngestGuardOptions;
}

export interface ContentIngestGuardOptions {
  readonly projectRoot?: string;
  readonly globalRoot?: string;
  readonly extensionPrivateRoot?: string;
  readonly pathWasContracted?: boolean;
}

export class HostContentAccessService implements ContentAccessService {
  private readonly providers: ContentAccessProvider[] = [];
  private readonly logger?: ContentAccessLogger;

  constructor(options: ContentAccessServiceOptions = {}) {
    this.logger = options.logger;
    for (const provider of options.providers ?? []) {
      this.registerProvider(provider);
    }
  }

  registerProvider(provider: ContentAccessProvider): void {
    const existingIndex = this.providers.findIndex((candidate) => candidate.id === provider.id);
    if (existingIndex >= 0) {
      this.providers.splice(existingIndex, 1, provider);
      return;
    }
    this.providers.push(provider);
  }

  async resolve(request: ContentAccessRequest): Promise<ContentAccessResult> {
    const guardDiagnostics = validateContentAccessRequest(request);
    if (hasErrorDiagnostic(guardDiagnostics)) {
      return createAccessFailure('unsupported-intent', request, guardDiagnostics);
    }

    const provider = this.providers.find((candidate) => safelySupports(candidate, request));
    if (!provider) {
      return createAccessFailure('unsupported-source', request, [
        {
          code: 'content-access-provider-missing',
          severity: 'error',
          message: 'No content access provider supports this request.',
          intent: request.intent,
          target: request.target,
        },
      ]);
    }

    try {
      const result = await provider.resolve({ request });
      return {
        ...result,
        providerId: result.providerId ?? provider.id,
        diagnostics: mergeDiagnostics(guardDiagnostics, result.diagnostics),
      };
    } catch (error) {
      this.logger?.error?.('Content access provider failed', {
        providerId: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return createAccessFailure('failed', request, [
        {
          code: 'content-access-provider-failed',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          providerId: provider.id,
          intent: request.intent,
          target: request.target,
        },
      ]);
    }
  }
}

export class HostContentIngestService implements ContentIngestService {
  private readonly providers: ContentIngestProvider[] = [];
  private readonly logger?: ContentAccessLogger;
  private readonly guardOptions: ContentIngestGuardOptions;

  constructor(options: ContentIngestServiceOptions = {}) {
    this.logger = options.logger;
    this.guardOptions = options.guardOptions ?? {};
    for (const provider of options.providers ?? []) {
      this.registerProvider(provider);
    }
  }

  registerProvider(provider: ContentIngestProvider): void {
    const existingIndex = this.providers.findIndex((candidate) => candidate.id === provider.id);
    if (existingIndex >= 0) {
      this.providers.splice(existingIndex, 1, provider);
      return;
    }
    this.providers.push(provider);
  }

  async ingest(request: ContentIngestRequest): Promise<ContentIngestResult> {
    const requestGuardDiagnostics = validateContentIngestRequest(request, this.guardOptions);
    if (hasErrorDiagnostic(requestGuardDiagnostics)) {
      return createIngestFailure('unsupported-destination', request, requestGuardDiagnostics);
    }

    const provider = this.providers.find((candidate) => safelySupportsIngest(candidate, request));
    if (!provider) {
      return createIngestFailure('unsupported-destination', request, [
        {
          code: 'content-ingest-provider-missing',
          severity: 'error',
          message: 'No content ingest provider supports this request.',
          destination: request.destination,
          ingestAction: request.mode,
        },
      ]);
    }

    try {
      const result = await provider.ingest({ request });
      const guardDiagnostics = validateContentIngestResult(result, this.guardOptions);
      if (hasErrorDiagnostic(guardDiagnostics)) {
        return {
          ...result,
          status: 'unsupported-destination',
          providerId: result.providerId ?? provider.id,
          diagnostics: mergeDiagnostics(result.diagnostics, guardDiagnostics),
        };
      }
      return {
        ...result,
        providerId: result.providerId ?? provider.id,
        diagnostics: mergeDiagnostics(result.diagnostics, guardDiagnostics),
      };
    } catch (error) {
      this.logger?.error?.('Content ingest provider failed', {
        providerId: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return createIngestFailure('failed', request, [
        {
          code: 'content-ingest-provider-failed',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          providerId: provider.id,
          destination: request.destination,
          ingestAction: request.mode,
        },
      ]);
    }
  }
}

function safelySupports(provider: ContentAccessProvider, request: ContentAccessRequest): boolean {
  try {
    return provider.supports(request);
  } catch {
    return false;
  }
}

function safelySupportsIngest(
  provider: ContentIngestProvider,
  request: ContentIngestRequest,
): boolean {
  try {
    return provider.supports(request);
  } catch {
    return false;
  }
}

function createAccessFailure(
  status: ContentAccessStatus,
  request: ContentAccessRequest,
  diagnostics: readonly ContentAccessDiagnostic[],
): ContentAccessResult {
  return {
    status,
    request,
    diagnostics,
    error: diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message,
  };
}

function createIngestFailure(
  status: ContentAccessStatus,
  request: ContentIngestRequest,
  diagnostics: readonly ContentAccessDiagnostic[],
): ContentIngestResult {
  return {
    status,
    request,
    diagnostics,
    error: diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message,
  };
}

function mergeDiagnostics(
  first: readonly ContentAccessDiagnostic[] | undefined,
  second: readonly ContentAccessDiagnostic[] | undefined,
): readonly ContentAccessDiagnostic[] | undefined {
  const diagnostics = [...(first ?? []), ...(second ?? [])];
  return diagnostics.length > 0 ? diagnostics : undefined;
}

function hasErrorDiagnostic(diagnostics: readonly ContentAccessDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
