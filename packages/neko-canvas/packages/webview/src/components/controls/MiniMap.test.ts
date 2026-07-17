import { describe, expect, it } from 'vitest';
import { createBuiltInMiniMapNodeStyleRegistry, resolveMiniMapNodeStyle } from './MiniMap';

describe('MiniMap node style registry', () => {
  it('registers built-in minimap styles for canvas node types', () => {
    const registry = createBuiltInMiniMapNodeStyleRegistry();

    expect(registry.media?.fill).toBe('#4ec9b0');
    expect(registry.storyboard?.fill).toBe('#ce9178');
    expect(registry.annotation?.fill).toBe('#dcdcaa');
    expect(registry.group?.fill).toBe('#569cd6');
    expect(registry.shot?.fill).toBe('#f59e0b');
    expect(registry.scene?.fill).toBe('#38bdf8');
    expect(registry.gallery?.fill).toBe('#8b5cf6');
    expect(registry.script?.fill).toBe('#10b981');
    expect(registry.document?.fill).toBe('#ef4444');
    expect(registry.model?.fill).toBe('#f97316');
  });

  it('falls back to the default style when a node type is not registered', () => {
    const style = resolveMiniMapNodeStyle({}, 'media');

    expect(style.fill).toBe('#4a4a4a');
    expect(style.opacity).toBe(0.8);
    expect(style.radius).toBe(1);
  });
});
