import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('domain routing architecture', () => {
  it('does not import runtime, Bevy, or ECS world concepts', () => {
    const source = readFileSync(resolve(__dirname, '../domain-routing.ts'), 'utf8');

    for (const forbidden of [
      'runtime-scene',
      'runtime-puppet',
      'bevy',
      'Bevy',
      'EcsWorld',
      'WorldHandle',
      'SceneService',
      'PuppetService',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
