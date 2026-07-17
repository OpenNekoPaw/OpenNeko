/**
 * Tests for ModuleOrchestrator: requires filtering, cache hits, ownership tracking,
 * layer-validation, re-render swap.
 */
import { describe, it, expect } from 'vitest';
import { ModuleOrchestrator } from '../composer/module-orchestrator';
import { PromptModuleRegistry } from '../registry/module-registry';
import { PromptSectionCache } from '../registry/section-cache';
import { SystemPromptComposer } from '../system-prompt-composer';
import type { PromptContext } from '../context';
import type { PromptModule, PromptModuleSection } from '../registry/module-manifest';

function minimalCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    runId: null,
    stage: null,
    locale: 'en',
    projectPath: '/tmp/p',
    activeSkillName: null,
    activeTools: [],
    ...overrides,
  };
}

function makeModule(
  id: string,
  overrides: {
    layers?: ('base' | 'skill' | 'environment' | 'ephemeral')[];
    requires?: (keyof PromptContext)[];
    priority?: number;
    dependsOn?: string[];
    cacheKey?: (ctx: PromptContext) => string | null;
    render: (ctx: PromptContext) => Promise<PromptModuleSection[] | null>;
    renderSync?: (ctx: PromptContext) => PromptModuleSection[] | null;
  },
): PromptModule {
  return {
    manifest: {
      id,
      layers: overrides.layers ?? ['skill'],
      requires: overrides.requires ?? [],
      priority: overrides.priority ?? 50,
      cost: 'free',
      ...(overrides.dependsOn ? { dependsOn: overrides.dependsOn } : {}),
      ...(overrides.cacheKey && { cacheKey: overrides.cacheKey }),
    },
    render: overrides.render,
    ...(overrides.renderSync ? { renderSync: overrides.renderSync } : {}),
  };
}

describe('ModuleOrchestrator', () => {
  it('skips a module whose requires are not met and clears prior owned sections', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    let renderCalls = 0;
    const mod = makeModule('skill.x', {
      requires: ['activeSkillName'],
      render: async () => {
        renderCalls += 1;
        return [{ sectionId: 'skill:x', layer: 'skill', content: 'SKILL_X_CONTENT' }];
      },
    });
    registry.register(mod);

    // First apply with activeSkillName set → module renders and writes.
    await orch.applyOne(mod, minimalCtx({ activeSkillName: 'x' }));
    expect(renderCalls).toBe(1);
    expect(composer.hasSection('skill:x')).toBe(true);

    // Second apply without activeSkillName → must clean up prior section.
    await orch.applyOne(mod, minimalCtx());
    expect(composer.hasSection('skill:x')).toBe(false);
  });

  it('populates cache on miss and reuses on hit', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    let renderCalls = 0;
    const mod = makeModule('m', {
      requires: ['activeSkillName'],
      cacheKey: (ctx) => ctx.activeSkillName,
      render: async () => {
        renderCalls += 1;
        return [{ sectionId: 'm:main', layer: 'skill', content: `r${renderCalls}` }];
      },
    });
    registry.register(mod);

    await orch.applyOne(mod, minimalCtx({ activeSkillName: 'a' }));
    await orch.applyOne(mod, minimalCtx({ activeSkillName: 'a' }));
    expect(renderCalls).toBe(1); // cache hit on second call
    expect(composer.getSection('m:main')?.content).toBe('r1');

    await orch.applyOne(mod, minimalCtx({ activeSkillName: 'b' })); // different key
    expect(renderCalls).toBe(2);
    expect(composer.getSection('m:main')?.content).toBe('r2');
  });

  it('removes previously-owned sections on re-render with different section ids', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    let round = 0;
    const mod = makeModule('m', {
      render: async () => {
        round += 1;
        return [{ sectionId: `m:v${round}`, layer: 'skill', content: `v${round}` }];
      },
    });
    registry.register(mod);

    await orch.applyOne(mod, minimalCtx());
    expect(composer.hasSection('m:v1')).toBe(true);

    await orch.applyOne(mod, minimalCtx());
    expect(composer.hasSection('m:v1')).toBe(false);
    expect(composer.hasSection('m:v2')).toBe(true);
  });

  it('does not touch sections owned by other writers', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    // Manual direct setSection call — not owned by any module.
    composer.setSection({ id: 'manual:foo', layer: 'environment', content: 'MANUAL' });

    const mod = makeModule('m', {
      render: async () => [{ sectionId: 'm:foo', layer: 'skill', content: 'MOD' }],
    });
    registry.register(mod);
    await orch.applyOne(mod, minimalCtx());

    // Re-render cycles should leave manually owned sections alone.
    await orch.applyOne(mod, minimalCtx());
    expect(composer.hasSection('manual:foo')).toBe(true);
    expect(composer.getSection('manual:foo')?.content).toBe('MANUAL');
  });

  it('null render result clears prior sections without writing new ones', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    let shouldEmit = true;
    const mod = makeModule('m', {
      render: async () =>
        shouldEmit ? [{ sectionId: 'm:a', layer: 'skill', content: 'A' }] : null,
    });
    registry.register(mod);

    await orch.applyOne(mod, minimalCtx());
    expect(composer.hasSection('m:a')).toBe(true);

    shouldEmit = false;
    await orch.applyOne(mod, minimalCtx());
    expect(composer.hasSection('m:a')).toBe(false);
  });

  it('throws when a module emits a section for an undeclared layer', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    const mod = makeModule('m', {
      layers: ['skill'],
      render: async () => [{ sectionId: 'm:bad', layer: 'base', content: 'OOPS' }],
    });
    registry.register(mod);

    await expect(orch.applyOne(mod, minimalCtx())).rejects.toThrow(/not declared/i);
  });

  it('applyAll invokes every registered module', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    const calls: string[] = [];
    registry.register(
      makeModule('a', {
        render: async () => {
          calls.push('a');
          return [{ sectionId: 'a:s', layer: 'skill', content: 'A' }];
        },
      }),
    );
    registry.register(
      makeModule('b', {
        render: async () => {
          calls.push('b');
          return [{ sectionId: 'b:s', layer: 'environment', content: 'B' }];
        },
        layers: ['environment'],
      }),
    );

    await orch.applyAll(minimalCtx());
    expect(calls.sort()).toEqual(['a', 'b']);
    expect(composer.hasSection('a:s')).toBe(true);
    expect(composer.hasSection('b:s')).toBe(true);
  });

  it('applyAll honors manifest.dependsOn instead of registry insertion order', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);
    const calls: string[] = [];

    registry.register(
      makeModule('dependent', {
        dependsOn: ['base'],
        render: async () => {
          calls.push('dependent');
          return [{ sectionId: 'dependent:s', layer: 'skill', content: 'dependent' }];
        },
      }),
    );
    registry.register(
      makeModule('base', {
        render: async () => {
          calls.push('base');
          return [{ sectionId: 'base:s', layer: 'skill', content: 'base' }];
        },
      }),
    );

    await orch.applyAll(minimalCtx());

    expect(calls).toEqual(['base', 'dependent']);
  });

  it('applyAllSync honors manifest.dependsOn for synchronous modules', () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);
    const calls: string[] = [];

    registry.register(
      makeModule('late', {
        dependsOn: ['early'],
        render: async () => null,
        renderSync: () => {
          calls.push('late');
          return [{ sectionId: 'late:s', layer: 'skill', content: 'late' }];
        },
      }),
    );
    registry.register(
      makeModule('early', {
        render: async () => null,
        renderSync: () => {
          calls.push('early');
          return [{ sectionId: 'early:s', layer: 'skill', content: 'early' }];
        },
      }),
    );

    orch.applyAllSync(minimalCtx());

    expect(calls).toEqual(['early', 'late']);
  });

  it('throws when a declared dependency is missing', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    registry.register(
      makeModule('orphan', {
        dependsOn: ['missing'],
        render: async () => [{ sectionId: 'orphan:s', layer: 'skill', content: 'orphan' }],
      }),
    );

    await expect(orch.applyAll(minimalCtx())).rejects.toThrow(/depends on missing module/i);
  });

  it('throws when dependencies form a cycle', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    registry.register(
      makeModule('a', {
        dependsOn: ['b'],
        render: async () => [{ sectionId: 'a:s', layer: 'skill', content: 'a' }],
      }),
    );
    registry.register(
      makeModule('b', {
        dependsOn: ['a'],
        render: async () => [{ sectionId: 'b:s', layer: 'skill', content: 'b' }],
      }),
    );

    await expect(orch.applyAll(minimalCtx())).rejects.toThrow(/circular dependency/i);
  });

  it('applyOneSync uses renderSync and participates in cache/ownership tracking', () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    let renderCalls = 0;
    const mod = makeModule('sync.m', {
      cacheKey: (ctx) => ctx.activeSkillName,
      render: async () => null,
      renderSync: (ctx) => {
        renderCalls += 1;
        return [
          {
            sectionId: `sync:${ctx.activeSkillName ?? 'none'}`,
            layer: 'skill',
            content: `render:${renderCalls}`,
          },
        ];
      },
    });
    registry.register(mod);

    orch.applyOneSync(mod, minimalCtx({ activeSkillName: 'draft' }));
    orch.applyOneSync(mod, minimalCtx({ activeSkillName: 'draft' }));

    expect(renderCalls).toBe(1);
    expect(composer.hasSection('sync:draft')).toBe(true);
    expect(composer.getSection('sync:draft')?.content).toBe('render:1');
  });

  it('applyOneSync throws when a module does not expose renderSync', () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    const mod = makeModule('async-only', {
      render: async () => [{ sectionId: 'async:only', layer: 'skill', content: 'A' }],
    });
    registry.register(mod);

    expect(() => orch.applyOneSync(mod, minimalCtx())).toThrow(/sync rendering/i);
  });

  it('clearModule removes owned sections on demand', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    const mod = makeModule('m', {
      render: async () => [{ sectionId: 'm:s', layer: 'skill', content: 'S' }],
    });
    registry.register(mod);
    await orch.applyOne(mod, minimalCtx());
    expect(composer.hasSection('m:s')).toBe(true);

    orch.clearModule('m');
    expect(composer.hasSection('m:s')).toBe(false);
  });

  it('reset clears cache and ownership (but leaves composer untouched)', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    const mod = makeModule('m', {
      cacheKey: () => 'k',
      render: async () => [{ sectionId: 'm:s', layer: 'skill', content: 'S' }],
    });
    registry.register(mod);
    await orch.applyOne(mod, minimalCtx());
    expect(cache.size()).toBe(1);

    orch.reset();
    expect(cache.size()).toBe(0);
    // Composer still has the section; reset doesn't touch it.
    expect(composer.hasSection('m:s')).toBe(true);
  });

  it('cacheKey returning null bypasses cache entirely', async () => {
    const registry = new PromptModuleRegistry();
    const composer = new SystemPromptComposer();
    const cache = new PromptSectionCache();
    const orch = new ModuleOrchestrator(registry, composer, cache);

    let renderCalls = 0;
    const mod = makeModule('m', {
      cacheKey: () => null,
      render: async () => {
        renderCalls += 1;
        return [{ sectionId: 'm:s', layer: 'skill', content: `r${renderCalls}` }];
      },
    });
    registry.register(mod);

    await orch.applyOne(mod, minimalCtx());
    await orch.applyOne(mod, minimalCtx());
    expect(renderCalls).toBe(2);
    expect(cache.size()).toBe(0);
  });
});
