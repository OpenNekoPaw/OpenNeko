import { describe, expect, it } from 'vitest';
import { createBuiltInMiniMapNodeStyleRegistry, resolveMiniMapNodeStyle } from './MiniMap';

describe('MiniMap node style registry', () => {
  it('registers built-in minimap styles for canvas node types', () => {
    const registry = createBuiltInMiniMapNodeStyleRegistry();

    expect(registry.media?.fill).toBe('#4ec9b0');
    expect(registry.markdown.fill).toBe('#dcdcaa');
    expect(registry.group?.fill).toBe('#569cd6');
    expect(registry.job.fill).toBe('#c586c0');
    expect(registry.file.fill).toBe('#ef4444');
    expect(registry['canvas-embed'].fill).toBe('#ce9178');
  });

  it('resolves the registered style for a canonical node type', () => {
    const style = resolveMiniMapNodeStyle(createBuiltInMiniMapNodeStyleRegistry(), 'media');

    expect(style.fill).toBe('#4ec9b0');
  });
});
