import { describe, expect, it, vi } from 'vitest';
import { ToolCategoryRegistry, ToolRegistry } from '@neko/agent';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  TOOL_NAMES_QUALITY,
  TOOL_NAMES_SYSTEM,
} from '@neko/shared';
import { createDocumentReadCapabilityProvider } from '../documentCapabilityProvider';
import { createMediaReadCapabilityProvider } from '../mediaCapabilityProvider';
import { CapabilityDiscoveryService } from '../../services/capabilityDiscoveryService';
import { createQualityCapabilityProvider } from '../qualityCapabilityProvider';
import { createSemanticCoverageCapabilityProvider } from '../searchCapabilityProvider';

const mocks = vi.hoisted(() => ({
  png1x1: new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]),
  getEngineClientProvider: vi.fn(() => ({})),
  contentAccessRuntime: {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(async (input: { source: unknown }) => ({
      status: 'ready' as const,
      source: input.source,
      diagnostics: [],
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: 25,
    })),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset: vi.fn(async (input: { source: unknown }) => ({
      status: 'ready' as const,
      source: input.source,
      diagnostics: [],
      bytes: mocks.png1x1,
      mimeType: 'image/png',
      sizeBytes: mocks.png1x1.byteLength,
    })),
    projectResource: vi.fn(),
  },
}));

vi.mock('vscode', async () => {
  const vscode = await import('../../__mocks__/vscode');
  return {
    ...vscode,
    commands: {
      ...vscode.commands,
      executeCommand: vi.fn(),
    },
  };
});

vi.mock('../../base', () => ({
  getRootLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('../../services/engineClientProvider', () => ({
  getEngineClientProvider: mocks.getEngineClientProvider,
}));

vi.mock('../../bootstrap/capabilityBootstrap', () => ({
  getCapabilityRuntimeBindings: vi.fn(() => ({
    contentAccessRuntime: mocks.contentAccessRuntime,
  })),
}));

describe('extension tool capability providers', () => {
  it('exposes document read tools through the document-owned provider', () => {
    const provider = createDocumentReadCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-agent-platform-document');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.READ_DOCUMENT]);
  });

  it('exposes image read through the media-owned provider', () => {
    const provider = createMediaReadCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-agent-platform-media');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.READ_IMAGE]);
  });

  it('registers canonical QualityCheck through the production capability registry path', async () => {
    const toolRegistry = new ToolRegistry();
    const capabilityDiscovery = new CapabilityDiscoveryService({
      toolRegistry,
      toolCategoryRegistry: new ToolCategoryRegistry(),
      providerCardRegistry: {
        register: vi.fn(),
        unregister: vi.fn(),
      },
    });
    const provider = createQualityCapabilityProvider({
      getContentAccessRuntime: vi.fn(),
      projectQualityFacadeResolver: { resolve: vi.fn().mockResolvedValue(undefined) },
    });

    capabilityDiscovery.registerProvider(provider, { extensionContext: {} });

    expect(capabilityDiscovery.hasProvider('neko-agent-media-quality')).toBe(true);
    const qualityCheck = toolRegistry.get(TOOL_NAMES_QUALITY.QUALITY_CHECK);
    expect(qualityCheck).toBeDefined();
    await expect(
      qualityCheck?.execute({
        target: {
          version: MEDIA_QUALITY_CONTRACT_VERSION,
          targetId: 'asset-cat',
          kind: 'image',
          resourceRef: {
            id: 'asset:image:cat',
            scope: 'project',
            provider: 'project',
            kind: 'media',
            source: {
              kind: 'file',
              projectRelativePath: 'neko/generated/image/cat.png',
            },
            fingerprint: { strategy: 'hash', value: 'sha256:cat-v1' },
          },
          revision: 'rev-1',
          contentDigest: 'sha256:cat-v1',
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        verdict: 'manual-review',
        missingEvaluatorClasses: ['perception'],
      },
    });
  });

  it('exposes semantic coverage through the search-owned provider', () => {
    const provider = createSemanticCoverageCapabilityProvider();
    const tools = provider.getTools({ extensionContext: {} }).map((tool) => tool.name);

    expect(provider.id).toBe('neko-search-semantic-coverage');
    expect(tools).toEqual([TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE]);
  });
});
