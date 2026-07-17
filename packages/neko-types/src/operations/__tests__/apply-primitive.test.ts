// =============================================================================
// Apply primitive abstraction tests (P2 W6)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { createApplyRegistry, type ApplyDescriptor } from '../apply-primitive';

interface Box {
  count: number;
}

const incDescriptor: ApplyDescriptor<Box, { amount: number }> = {
  namespace: 'test.inc',
  idempotent: true,
  destructive: false,
  apply: (data, op) => ({ count: data.count + op.amount }),
};

describe('ApplyRegistry', () => {
  it('register + get round-trips a descriptor', () => {
    const reg = createApplyRegistry();
    reg.register('test.inc', incDescriptor);
    const got = reg.get<Box, { amount: number }>('test.inc');
    expect(got?.namespace).toBe('test.inc');
    expect(got?.idempotent).toBe(true);
    expect(got?.apply({ count: 3 }, { amount: 4 })).toEqual({ count: 7 });
  });

  it('get returns undefined for unknown key', () => {
    const reg = createApplyRegistry();
    expect(reg.get('nope')).toBeUndefined();
  });

  it('duplicate register throws', () => {
    const reg = createApplyRegistry();
    reg.register('test.inc', incDescriptor);
    expect(() => reg.register('test.inc', incDescriptor)).toThrow(/duplicate key/);
  });

  it('list returns insertion order', () => {
    const reg = createApplyRegistry();
    reg.register('a', incDescriptor);
    reg.register('b', { ...incDescriptor, namespace: 'b' });
    reg.register('c', { ...incDescriptor, namespace: 'c' });
    expect(reg.list()).toEqual(['a', 'b', 'c']);
  });

  it('unregister removes the descriptor', () => {
    const reg = createApplyRegistry();
    reg.register('test.inc', incDescriptor);
    reg.unregister('test.inc');
    expect(reg.get('test.inc')).toBeUndefined();
    expect(reg.list()).toEqual([]);
  });

  it('destructive/idempotent metadata is preserved for recovery callers', () => {
    const reg = createApplyRegistry();
    const destructive: ApplyDescriptor<Box, { id: string }> = {
      namespace: 'test.drop',
      idempotent: false,
      destructive: true,
      apply: (data) => data,
    };
    reg.register('test.drop', destructive);
    const d = reg.get('test.drop')!;
    expect(d.destructive).toBe(true);
    expect(d.idempotent).toBe(false);
  });
});
