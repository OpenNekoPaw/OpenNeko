/**
 * BaseRegistry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseRegistry } from '../base-registry';

// Concrete implementation for testing
class TestRegistry extends BaseRegistry<'type-a' | 'type-b', { name: string }> {
  initializeWithBuiltins(): void {
    this.builtinItems.set('type-a', { name: 'Builtin A' });
    this.builtinItems.set('type-b', { name: 'Builtin B' });
  }
}

describe('BaseRegistry', () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
    registry.initializeWithBuiltins();
  });

  describe('get', () => {
    it('should return builtin item by key', () => {
      const item = registry.get('type-a');
      expect(item).toEqual({ name: 'Builtin A' });
    });

    it('should return undefined for non-existent key', () => {
      const item = registry.get('type-c' as 'type-a');
      expect(item).toBeUndefined();
    });
  });

  describe('register/unregister', () => {
    it('should register custom item', () => {
      registry.register('custom-1', { name: 'Custom 1' });
      const item = registry.getCustom('custom-1');
      expect(item).toEqual({ name: 'Custom 1' });
    });

    it('should unregister custom item', () => {
      registry.register('custom-1', { name: 'Custom 1' });
      registry.unregister('custom-1');
      const item = registry.getCustom('custom-1');
      expect(item).toBeUndefined();
    });
  });

  describe('getForType', () => {
    it('should return builtin item for builtin type', () => {
      const item = registry.getForType('type-a');
      expect(item).toEqual({ name: 'Builtin A' });
    });

    it('should return custom item for custom type', () => {
      registry.register('custom-1', { name: 'Custom 1' });
      const item = registry.getForType('custom-1');
      expect(item).toEqual({ name: 'Custom 1' });
    });

    it('should prefer custom over builtin when same key', () => {
      registry.register('type-a', { name: 'Custom A' });
      const item = registry.getForType('type-a');
      expect(item).toEqual({ name: 'Custom A' });
    });
  });

  describe('has', () => {
    it('should return true for builtin type', () => {
      expect(registry.has('type-a')).toBe(true);
    });

    it('should return true for custom type', () => {
      registry.register('custom-1', { name: 'Custom 1' });
      expect(registry.has('custom-1')).toBe(true);
    });

    it('should return false for non-existent type', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('listTypes', () => {
    it('should list all builtin types', () => {
      const types = registry.listTypes();
      expect(types).toContain('type-a');
      expect(types).toContain('type-b');
    });

    it('should include custom types', () => {
      registry.register('custom-1', { name: 'Custom 1' });
      const types = registry.listTypes();
      expect(types).toContain('custom-1');
    });

    it('should not duplicate types', () => {
      registry.register('type-a', { name: 'Custom A' });
      const types = registry.listTypes();
      const countA = types.filter((t) => t === 'type-a').length;
      expect(countA).toBe(1);
    });
  });
});
