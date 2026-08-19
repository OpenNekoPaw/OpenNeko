import type { Tool } from '@neko/agent-contracts';
import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../tool-registry';

function createTool(name: string): Tool {
  return {
    name,
    description: `${name} description`,
    category: 'system',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  };
}

describe('ToolRegistry exact registration', () => {
  it('rejects a duplicate Tool identity without replacing the registered Tool', () => {
    const registry = new ToolRegistry();
    const existing = createTool('content.read');
    registry.register(existing);

    expect(() => registry.register(createTool('content.read'))).toThrow(
      "Tool 'content.read' is already registered.",
    );
    expect(registry.get('content.read')).toBe(existing);
  });

  it('rejects a duplicate batch atomically', () => {
    const registry = new ToolRegistry();

    expect(() =>
      registry.registerMany([createTool('canvas.query'), createTool('canvas.query')]),
    ).toThrow("Tool 'canvas.query' is already registered.");
    expect(registry.list()).toEqual([]);
  });
});
