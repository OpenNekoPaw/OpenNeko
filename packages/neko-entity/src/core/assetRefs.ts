import type {
  AssetRefResolver,
  AssetRefScheme,
  AssetRefValidation,
  ParsedAssetRef,
  ResolvedAssetRef,
} from '@neko/shared';
import { isAssetRefScheme } from '@neko/shared';

export type AssetRefBackendResolver = (
  parsed: ParsedAssetRef,
) => Promise<Omit<ResolvedAssetRef, 'ref' | 'scheme'> | undefined>;

export interface DefaultAssetRefResolverOptions {
  readonly project?: AssetRefBackendResolver;
  readonly shared?: AssetRefBackendResolver;
  readonly external?: AssetRefBackendResolver;
}

export class DefaultAssetRefResolver implements AssetRefResolver {
  constructor(private readonly backends: DefaultAssetRefResolverOptions = {}) {}

  parse(ref: string): ParsedAssetRef {
    const separatorIndex = ref.indexOf('://');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid assetRef "${ref}": missing scheme`);
    }

    const rawScheme = ref.slice(0, separatorIndex);
    if (!isAssetRefScheme(rawScheme)) {
      throw new Error(`Invalid assetRef "${ref}": unsupported scheme "${rawScheme}"`);
    }

    const rest = ref.slice(separatorIndex + 3);
    const queryIndex = rest.indexOf('?');
    const withoutQuery = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
    const queryString = queryIndex >= 0 ? rest.slice(queryIndex + 1) : '';
    const slashIndex = withoutQuery.indexOf('/');
    const authority = slashIndex >= 0 ? withoutQuery.slice(0, slashIndex) : withoutQuery;
    const refPath = slashIndex >= 0 ? withoutQuery.slice(slashIndex + 1) : '';
    const versionMatch = authority.match(/^(.*)@([^@]+)$/);

    return {
      scheme: rawScheme,
      raw: ref,
      authority: authority || undefined,
      path: refPath,
      version: versionMatch?.[2],
      query: parseAssetRefQuery(queryString),
    };
  }

  validate(ref: string): AssetRefValidation {
    try {
      const parsed = this.parse(ref);
      if (!parsed.authority && !parsed.path) {
        return { valid: false, reason: 'assetRef must include an authority or path' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Invalid assetRef',
      };
    }
  }

  async resolve(ref: string): Promise<ResolvedAssetRef> {
    const parsed = this.parse(ref);
    const backend = this.backends[parsed.scheme];
    const resolved = backend ? await backend(parsed) : undefined;

    if (resolved) {
      return {
        ref,
        scheme: parsed.scheme,
        ...resolved,
      };
    }

    return createFallbackResolvedAssetRef(parsed);
  }
}

function createFallbackResolvedAssetRef(parsed: ParsedAssetRef): ResolvedAssetRef {
  return {
    ref: parsed.raw,
    scheme: parsed.scheme,
    source: parsed.scheme,
    readonly: parsed.scheme !== 'project',
    assetEntityId: parsed.scheme === 'project' ? parsed.path || parsed.authority : undefined,
    uri: parsed.raw,
  };
}

function parseAssetRefQuery(query: string): Record<string, string> | undefined {
  if (!query) {
    return undefined;
  }

  const params = new URLSearchParams(query);
  const entries = Array.from(params.entries());
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export function isSupportedAssetRefScheme(value: string): value is AssetRefScheme {
  return isAssetRefScheme(value);
}
