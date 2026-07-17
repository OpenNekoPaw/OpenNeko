import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolCategoryRegistry, ToolRegistry } from '@neko/agent';
import type { AgentCapabilityProvider, ProviderCard, Tool } from '@neko/shared';
import { CapabilityDiscoveryService } from '../capabilityDiscoveryService';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const capabilityLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../base', () => ({
  getRootLogger: () => ({ child: () => capabilityLogger }),
}));

function createTool(name: string, category = 'system'): Tool {
  return {
    name,
    description: `${name} description`,
    category,
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  };
}

function createProvider(id: string, tools: readonly Tool[]): AgentCapabilityProvider {
  return {
    id,
    version: '1.0.0',
    getTools: () => [...tools],
  };
}

describe('CapabilityDiscoveryService', () => {
  let toolRegistry: ToolRegistry;
  let toolCategoryRegistry: ToolCategoryRegistry;
  let providerCardRegistry: {
    register: ReturnType<typeof vi.fn>;
    unregister: ReturnType<typeof vi.fn>;
  };
  let service: CapabilityDiscoveryService;

  beforeEach(() => {
    capabilityLogger.info.mockReset();
    capabilityLogger.warn.mockReset();
    capabilityLogger.debug.mockReset();
    toolRegistry = new ToolRegistry();
    toolCategoryRegistry = new ToolCategoryRegistry();
    providerCardRegistry = { register: vi.fn(), unregister: vi.fn() };
    service = new CapabilityDiscoveryService({
      toolRegistry,
      toolCategoryRegistry,
      providerCardRegistry,
    });
  });

  it('registers and removes provider tools through the canonical registries', () => {
    const tool = createTool('RenderTimeline', 'media');

    service.registerProvider(createProvider('neko.cut', [tool]), { extensionContext: {} });

    expect(toolRegistry.get(tool.name)).toBe(tool);
    expect(toolCategoryRegistry.getToolInfo(tool.name)).toMatchObject({
      name: tool.name,
      category: 'media',
    });

    service.unregisterProvider('neko.cut');

    expect(toolRegistry.get(tool.name)).toBeUndefined();
    expect(toolCategoryRegistry.getToolInfo(tool.name)).toBeUndefined();
  });

  it('resolves domain lifecycle descriptors without taking ownership of execution', () => {
    const provider = createProvider('neko-canvas', [createTool('CanvasIngestMarkdown', 'canvas')]);
    provider.getArtifactFacets = () => ({
      lifecycleCapabilities: [
        {
          capabilityId: 'canvas.ingestMarkdown',
          providerId: 'neko-canvas',
          displayName: 'Ingest Markdown to Canvas',
          description: 'Ingest reviewed Markdown into Canvas.',
          phases: ['review'],
          inputSchema: { id: 'canvas.markdown.input', version: 1 },
          resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
          accepts: ['Markdown'],
          produces: ['canvas-node-ref'],
          risk: 'medium',
          requiresApproval: true,
          safetyKind: 'confirmation-gated',
        },
      ],
    });

    service.registerProvider(provider, { extensionContext: {} });

    expect(service.getLifecycleCapabilityDescriptor('canvas.ingestMarkdown')).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      providerId: 'neko-canvas',
    });
    service.unregisterProvider('neko-canvas');
    expect(service.getLifecycleCapabilityDescriptor('canvas.ingestMarkdown')).toBeUndefined();
  });

  it('projects provider cards and removes their registrations with the provider', () => {
    const card: ProviderCard = {
      providerId: 'flux',
      modelId: 'flux-pro',
      displayName: 'Flux Pro',
      version: '1.0.0',
      capabilities: ['image.generate'],
      sourceLayer: 'builtin',
      syntaxProfile: { supportsNegativePrompt: false, notes: [] },
      conceptCoverage: { entries: [] },
      trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
    };
    const provider = createProvider('neko.provider-cards', []);
    provider.getProviderCards = () => [card];

    service.registerProvider(provider, { extensionContext: {} });
    expect(providerCardRegistry.register).toHaveBeenCalledWith(card);

    service.unregisterProvider(provider.id);
    expect(providerCardRegistry.unregister).toHaveBeenCalledWith('flux', undefined, 'flux-pro');
  });

  it('exposes protocol metadata for registered providers', () => {
    service.registerProvider(createProvider('neko.core', []), { extensionContext: {} });

    expect(service.getCapabilityProtocolInfo('neko.core')).toEqual({
      providerId: 'neko.core',
      protocolVersion: '1.0',
      trustLevel: 'core',
      hostRequirements: [{ host: 'vscode' }],
      lifecycleHooks: [],
      source: 'provider',
    });
  });

  it('fails visibly once when prompt fragments are requested before activation', () => {
    expect(service.getAllPromptFragments()).toEqual([]);
    expect(capabilityLogger.warn).toHaveBeenCalledWith(
      'Skipping capability prompt fragment aggregation because capability context is not initialized.',
      expect.objectContaining({
        code: 'extension.capability.prompt-fragments-skipped',
        reason: 'missing-capability-context',
      }),
    );

    capabilityLogger.warn.mockClear();
    expect(service.getAllPromptFragments()).toEqual([]);
    expect(capabilityLogger.warn).not.toHaveBeenCalled();
  });
});
