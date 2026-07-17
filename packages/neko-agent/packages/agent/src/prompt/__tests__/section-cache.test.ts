/**
 * Tests for PromptSectionCache: LRU behaviour, eviction, clear/delete.
 */
import { describe, it, expect } from 'vitest';
import { PromptSectionCache } from '../registry/section-cache';
import type { PromptModuleSection } from '../registry/module-manifest';

function stubSection(id: string, content = 'x'): PromptModuleSection {
  return { sectionId: id, layer: 'skill', content };
}

describe('PromptSectionCache', () => {
  it('stores and retrieves by key', () => {
    const cache = new PromptSectionCache();
    cache.set('k1', [stubSection('s1')]);
    const sections = cache.get('k1');
    expect(sections).toBeDefined();
    expect(sections?.[0]?.sectionId).toBe('s1');
  });

  it('returns undefined for missing keys', () => {
    const cache = new PromptSectionCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('updates existing key without growing size', () => {
    const cache = new PromptSectionCache();
    cache.set('k', [stubSection('s1')]);
    cache.set('k', [stubSection('s2')]);
    expect(cache.size()).toBe(1);
    expect(cache.get('k')?.[0]?.sectionId).toBe('s2');
  });

  it('evicts the oldest entry when exceeding capacity', () => {
    const cache = new PromptSectionCache(2);
    cache.set('a', [stubSection('sa')]);
    cache.set('b', [stubSection('sb')]);
    cache.set('c', [stubSection('sc')]); // evicts 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('LRU touch on get moves key to most-recently-used', () => {
    const cache = new PromptSectionCache(2);
    cache.set('a', [stubSection('sa')]);
    cache.set('b', [stubSection('sb')]);
    cache.get('a'); // touches 'a'
    cache.set('c', [stubSection('sc')]); // evicts 'b' (oldest unused)
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('delete removes a single key and returns true if existed', () => {
    const cache = new PromptSectionCache();
    cache.set('k', [stubSection('s')]);
    expect(cache.delete('k')).toBe(true);
    expect(cache.delete('k')).toBe(false);
    expect(cache.get('k')).toBeUndefined();
  });

  it('clear empties the cache', () => {
    const cache = new PromptSectionCache();
    cache.set('a', [stubSection('sa')]);
    cache.set('b', [stubSection('sb')]);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('throws on non-positive capacity', () => {
    expect(() => new PromptSectionCache(0)).toThrow();
    expect(() => new PromptSectionCache(-1)).toThrow();
  });
});
