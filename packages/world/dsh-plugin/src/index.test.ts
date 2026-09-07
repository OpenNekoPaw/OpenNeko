import { describe, expect, it, vi } from 'vitest';
import { apply } from './index';

describe('World DSH plugin', () => {
  it('registers the canonical World Tool through DSH tools', () => {
    const register = vi.fn();
    const effect = vi.fn((factory: () => unknown) => factory());
    apply({ effect, tools: { register } } as never);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]?.[0]).toMatchObject({ name: 'openneko_world' });
  });
});
