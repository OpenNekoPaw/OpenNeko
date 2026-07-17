import type { ContentAccessRequest, ContentEngineSource } from '@neko/shared';
import type { EngineClient, FileAccessPurpose } from './EngineClient';

export interface EngineClientProviderLike {
  getOptionalClient(): Promise<EngineClient | null>;
}

export interface CreateEngineContentAccessAdapterOptions {
  readonly engineClientProvider: EngineClientProviderLike;
  readonly maxProviderAssetBytes?: number;
}

export interface EngineContentAccessAdapter {
  createEngineSource(request: ContentAccessRequest, filePath: string): Promise<ContentEngineSource>;
  readProviderAssetBytes(input: {
    readonly request: ContentAccessRequest;
    readonly filePath: string;
    readonly maxBytes?: number;
  }): Promise<{
    readonly bytes: Uint8Array;
    readonly mimeType?: string;
    readonly sizeBytes: number;
  }>;
  createFileLowLevelAccess(): EngineFileLowLevelAccess;
}

export interface EngineFileLowLevelAccess {
  identify(filePath: string): Promise<{ fileId?: string; sizeBytes?: number }>;
  readText(filePath: string): Promise<string>;
  readFile(filePath: string): Promise<Uint8Array>;
  readRange(filePath: string, start: number, end: number): Promise<Uint8Array>;
}

const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

export function createEngineContentAccessAdapter(
  options: CreateEngineContentAccessAdapterOptions,
): EngineContentAccessAdapter {
  const maxProviderAssetBytes = options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES;

  async function getEngine(boundary: string): Promise<EngineClient> {
    const engine = await options.engineClientProvider.getOptionalClient();
    if (!engine) throw new Error(`Engine file access is unavailable for ${boundary}.`);
    return engine;
  }

  const adapter: EngineContentAccessAdapter = {
    async createEngineSource(request, filePath) {
      const engine = await getEngine('engine media source access');
      const registered = await engine.registerFile({
        filePath,
        purpose: readEnginePurpose(request),
        mimeHint: readStringMetadata(request.metadata, 'mimeType'),
      });
      return { token: registered.token, sourcePath: filePath, runtimeOnly: true };
    },

    async readProviderAssetBytes(input) {
      const engine = await getEngine('binary media provider assets');
      const maxBytes = input.maxBytes ?? maxProviderAssetBytes;
      return engine.withRegisteredFile(
        {
          filePath: input.filePath,
          purpose: readEnginePurpose(input.request),
          mimeHint: readStringMetadata(input.request.metadata, 'mimeType'),
        },
        async (registered) => {
          if (input.request.signal?.aborted) throw new Error('Operation aborted.');
          if (registered.fileSizeBytes > maxBytes) {
            throw new Error(`Provider asset is too large: ${registered.fileSizeBytes} bytes.`);
          }
          const bytes =
            registered.fileSizeBytes === 0
              ? new Uint8Array()
              : new Uint8Array(
                  await engine.readFileRange(
                    registered.token,
                    0,
                    registered.fileSizeBytes - 1,
                    input.request.signal,
                  ),
                );
          return {
            bytes,
            mimeType: readStringMetadata(input.request.metadata, 'mimeType'),
            sizeBytes: registered.fileSizeBytes,
          };
        },
      );
    },

    createFileLowLevelAccess() {
      const withFile = async <T>(
        filePath: string,
        task: (engine: EngineClient, token: string, size: number) => Promise<T>,
      ): Promise<T> => {
        const engine = await getEngine('media file access');
        return engine.withRegisteredFile({ filePath, purpose: 'media-decode' }, (registered) =>
          task(engine, registered.token, registered.fileSizeBytes),
        );
      };

      const access: EngineFileLowLevelAccess = {
        identify: (filePath) =>
          withFile(filePath, async (_engine, _token, sizeBytes) => ({
            fileId: `${filePath}:${sizeBytes}`,
            sizeBytes,
          })),
        async readText(filePath) {
          return new TextDecoder().decode(await access.readFile(filePath));
        },
        readFile: (filePath) =>
          withFile(filePath, async (engine, token, size) =>
            size === 0
              ? new Uint8Array()
              : new Uint8Array(await engine.readFileRange(token, 0, size - 1)),
          ),
        readRange: (filePath, start, end) =>
          withFile(
            filePath,
            async (engine, token) => new Uint8Array(await engine.readFileRange(token, start, end)),
          ),
      };
      return access;
    },
  };

  return adapter;
}

export function readEnginePurpose(request: ContentAccessRequest): FileAccessPurpose {
  const purpose = readStringMetadata(request.metadata, 'enginePurpose');
  if (purpose === 'preview' || purpose === 'media-decode' || purpose === 'subtitle') {
    return purpose;
  }
  return 'other';
}

function readStringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
