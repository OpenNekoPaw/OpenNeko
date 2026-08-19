import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityProvider, PromptFragment, Tool } from '@neko/agent-contracts';
import { ToolRegistry } from '../../tools';
import { CapabilityRegistryRuntime } from '../capability/capability-registry-runtime';

function createTool(name: string): Tool {
  return {
    name,
    description: `${name} description`,
    category: 'system',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  };
}

function createProvider(id: string, tools: Tool[]): AgentCapabilityProvider {
  return {
    id,
    getTools: () => tools,
  };
}

describe('CapabilityRegistryRuntime', () => {
  it('projects localized provider prompt fragments from the registered capability context', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });
    const fragment = {
      id: 'neko.canvas:markdown',
      content: 'Canvas Markdown guidance.',
      locales: {
        zh: {
          content: 'Canvas Markdown 中文指导。',
        },
      },
    } satisfies PromptFragment & {
      readonly locales: {
        readonly zh: {
          readonly content: string;
        };
      };
    };

    runtime.registerProvider(
      {
        ...createProvider('neko.canvas', []),
        getPromptFragments: () => [fragment],
      },
      { hostContext: {}, locale: 'zh' },
    );

    expect(runtime.getAllPromptFragments()).toEqual([
      expect.objectContaining({
        id: 'neko.canvas:markdown',
        content: 'Canvas Markdown 中文指导。',
      }),
    ]);
  });

  it('cleans registered providers that no longer have installed manifests', () => {
    const toolRegistry = new ToolRegistry();
    const disposed = vi.fn();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });
    const installedTool = createTool('InstalledTool');
    const removedTool = createTool('RemovedTool');

    runtime.registerProvider(createProvider('neko.installed', [installedTool]), {
      hostContext: {},
    });
    runtime.registerProvider(
      {
        ...createProvider('neko.removed', [removedTool]),
        dispose: disposed,
      },
      { hostContext: {} },
    );
    runtime.replaceManifests([
      {
        id: 'neko.installed',
        displayName: 'Installed',
        capabilities: [],
      },
    ]);

    expect(runtime.cleanupProvidersWithoutManifests()).toEqual(['neko.removed']);
    expect(runtime.hasProvider('neko.installed')).toBe(true);
    expect(runtime.hasProvider('neko.removed')).toBe(false);
    expect(toolRegistry.get('InstalledTool')).toBe(installedTool);
    expect(toolRegistry.get('RemovedTool')).toBeUndefined();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate provider id without replacing the registered provider', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });
    const fragment: PromptFragment = {
      id: 'neko.duplicate:context',
      content: 'Original context.',
      locales: { zh: { content: '重复上下文。' } },
    };

    runtime.registerProvider(
      {
        ...createProvider('neko.duplicate', [createTool('FirstTool')]),
        getPromptFragments: () => [fragment],
      },
      { hostContext: {}, locale: 'en' },
    );
    expect(() =>
      runtime.registerProvider(createProvider('neko.duplicate', [createTool('SecondTool')]), {
        hostContext: {},
        locale: 'zh',
      }),
    ).toThrow("Capability provider 'neko.duplicate' is already registered.");

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.provider.duplicate-id',
          reason: 'duplicate-provider-id',
          context: expect.objectContaining({
            providerId: 'neko.duplicate',
            existingProviderId: 'neko.duplicate',
            conflictingProviderId: 'neko.duplicate',
          }),
        }),
      ]),
    );
    expect(toolRegistry.get('FirstTool')).toBeDefined();
    expect(toolRegistry.get('SecondTool')).toBeUndefined();
    expect(runtime.getAllPromptFragments()).toEqual([
      expect.objectContaining({ content: 'Original context.' }),
    ]);
  });

  it('rejects a duplicate canonical Tool identity and preserves the existing owner', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.story', [createTool('GenerateScene')]), {
      hostContext: {},
    });
    expect(() =>
      runtime.registerProvider(createProvider('neko.canvas', [createTool('GenerateScene')]), {
        hostContext: {},
      }),
    ).toThrow("Capability Tool 'GenerateScene' is already registered.");

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.tool.name-collision',
          reason: 'provider-name-collision',
          context: expect.objectContaining({
            capabilityKind: 'tool',
            name: 'GenerateScene',
            providerId: 'neko.canvas',
            existingOwner: 'neko.story',
          }),
        }),
      ]),
    );
    expect(runtime.hasProvider('neko.story')).toBe(true);
    expect(runtime.hasProvider('neko.canvas')).toBe(false);
    expect(toolRegistry.get('GenerateScene')).toBeDefined();
  });

  it('records conflicting short names across provider namespaces', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.story', [createTool('story.GenerateScene')]), {
      hostContext: {},
    });
    runtime.registerProvider(createProvider('neko.canvas', [createTool('canvas.GenerateScene')]), {
      hostContext: {},
    });
    runtime.unregisterProvider('neko.canvas');
    runtime.registerProvider(createProvider('neko.cut', [createTool('cut.GenerateScene')]), {
      hostContext: {},
    });

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.tool.short-name-collision',
          reason: 'conflicting-short-name',
          context: expect.objectContaining({
            name: 'cut.GenerateScene',
            shortName: 'generatescene',
            providerId: 'neko.cut',
            existingOwner: 'neko.story',
            existingToolName: 'story.GenerateScene',
          }),
        }),
      ]),
    );
  });
});
