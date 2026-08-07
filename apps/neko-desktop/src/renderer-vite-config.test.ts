import { describe, expect, it } from 'vitest';
import rendererConfig, {
  DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES,
} from '../vite.renderer.config';

describe('Desktop renderer Vite workspace resolution', () => {
  it('keeps Agent Contracts on one watched workspace source identity', () => {
    expect(DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES).toContain('@neko/agent-contracts');
    expect(rendererConfig.resolve?.dedupe).toContain('@neko/agent-contracts');
    expect(rendererConfig.optimizeDeps?.exclude).toContain('@neko/agent-contracts');
  });
});
