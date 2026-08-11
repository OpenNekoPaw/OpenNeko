import { describe, expect, it, vi } from 'vitest';
import { DesktopCharacterPresentationSurfaceRegistry } from './character-presentation-surface-registry';
import type { DesktopCharacterPresentationSurfaceRef } from './desktop-scene-contract';

const surface: DesktopCharacterPresentationSurfaceRef = {
  kind: 'character-presentation',
  owner: {
    kind: 'character',
    characterId: 'character-a',
    characterRunId: 'character-run-a',
    dialogueRunId: 'dialogue-a',
  },
  surfaceKind: 'avatar',
  providerId: 'chara.representation',
  surfaceId: 'surface-a',
};

describe('DesktopCharacterPresentationSurfaceRegistry', () => {
  it('resolves only the exact surface-kind and provider registration', () => {
    const resolve = vi.fn(() => 'avatar-renderer');
    const registry = new DesktopCharacterPresentationSurfaceRegistry<string>();
    registry.register({
      providerId: 'chara.representation',
      surfaceKind: 'avatar',
      resolve,
    });

    expect(registry.resolve(surface)).toBe('avatar-renderer');
    expect(resolve).toHaveBeenCalledWith(surface);
    expect(() => registry.resolve({ ...surface, providerId: 'game.presentation' })).toThrow(
      "provider 'game.presentation' is unavailable",
    );
    expect(() => registry.resolve({ ...surface, surfaceKind: 'gameplay' })).toThrow(
      "unavailable for 'gameplay'",
    );
  });

  it('rejects duplicate exact registrations without replacing the first provider', () => {
    const registry = new DesktopCharacterPresentationSurfaceRegistry<string>();
    registry.register({
      providerId: 'chara.representation',
      surfaceKind: 'avatar',
      resolve: () => 'first',
    });

    expect(() =>
      registry.register({
        providerId: 'chara.representation',
        surfaceKind: 'avatar',
        resolve: () => 'second',
      }),
    ).toThrow('already registered');
    expect(registry.resolve(surface)).toBe('first');
  });
});
