/**
 * Tests for PromptModuleRegistry: register / dedup / byLayer sort / unregister.
 */
import { describe, it, expect } from 'vitest';
import { PromptModuleRegistry } from '../registry/module-registry';
import type { PromptModule, PromptModuleManifest } from '../registry/module-manifest';

function makeStubModule(overrides: Partial<PromptModuleManifest> & { id: string }): PromptModule {
  return {
    manifest: {
      layers: ['skill'],
      requires: [],
      priority: 50,
      cost: 'free',
      ...overrides,
    },
    render: async () => null,
  };
}

describe('PromptModuleRegistry', () => {
  it('registers a module and exposes it via get/has/all', () => {
    const registry = new PromptModuleRegistry();
    const mod = makeStubModule({ id: 'a' });
    registry.register(mod);
    expect(registry.has('a')).toBe(true);
    expect(registry.get('a')).toBe(mod);
    expect(registry.size()).toBe(1);
    expect(registry.all()).toHaveLength(1);
  });

  it('throws on duplicate id', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'a' }));
    expect(() => registry.register(makeStubModule({ id: 'a' }))).toThrow(/duplicate/i);
  });

  it('unregister removes a module and returns true', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'a' }));
    expect(registry.unregister('a')).toBe(true);
    expect(registry.has('a')).toBe(false);
    expect(registry.unregister('a')).toBe(false);
  });

  it('byLayer returns only modules declaring that layer', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'skill-one', layers: ['skill'] }));
    registry.register(makeStubModule({ id: 'env-one', layers: ['environment'] }));
    registry.register(makeStubModule({ id: 'both', layers: ['skill', 'environment'] }));
    expect(registry.byLayer('skill').map((m) => m.manifest.id)).toEqual(['skill-one', 'both']);
    expect(registry.byLayer('environment').map((m) => m.manifest.id)).toEqual(['env-one', 'both']);
  });

  it('byLayer sorts by priority descending', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'low', priority: 10 }));
    registry.register(makeStubModule({ id: 'high', priority: 90 }));
    registry.register(makeStubModule({ id: 'mid', priority: 50 }));
    expect(registry.byLayer('skill').map((m) => m.manifest.id)).toEqual(['high', 'mid', 'low']);
  });

  it('ties in priority preserve insertion order', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'first', priority: 50 }));
    registry.register(makeStubModule({ id: 'second', priority: 50 }));
    registry.register(makeStubModule({ id: 'third', priority: 50 }));
    expect(registry.byLayer('skill').map((m) => m.manifest.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('all() returns modules in insertion order', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'a' }));
    registry.register(makeStubModule({ id: 'b' }));
    registry.register(makeStubModule({ id: 'c' }));
    expect(registry.all().map((m) => m.manifest.id)).toEqual(['a', 'b', 'c']);
  });

  it('clear removes all modules', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'a' }));
    registry.register(makeStubModule({ id: 'b' }));
    registry.clear();
    expect(registry.size()).toBe(0);
    expect(registry.all()).toEqual([]);
  });

  it('get returns undefined for unknown id', () => {
    const registry = new PromptModuleRegistry();
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.has('missing')).toBe(false);
  });

  it('a module declaring multiple layers appears in byLayer for each', () => {
    const registry = new PromptModuleRegistry();
    registry.register(makeStubModule({ id: 'triple', layers: ['base', 'skill', 'ephemeral'] }));
    expect(registry.byLayer('base')).toHaveLength(1);
    expect(registry.byLayer('skill')).toHaveLength(1);
    expect(registry.byLayer('environment')).toHaveLength(0);
    expect(registry.byLayer('ephemeral')).toHaveLength(1);
  });
});
