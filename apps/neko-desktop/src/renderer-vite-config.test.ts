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

  it('keeps the lazy Text Editor and CodeMirror runtime on canonical module identities', () => {
    expect(DESKTOP_RENDERER_CANONICAL_WORKSPACE_ENTRIES).toContain(
      '@neko/text-editor-webview/root',
    );
    expect(rendererConfig.resolve?.dedupe).toEqual(
      expect.arrayContaining([
        '@neko/text-editor-webview',
        '@codemirror/autocomplete',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/state',
        '@codemirror/view',
      ]),
    );
    expect(rendererConfig.optimizeDeps?.exclude).toContain('@neko/text-editor-webview/root');
    expect(rendererConfig.optimizeDeps?.include).toEqual(
      expect.arrayContaining([
        '@codemirror/autocomplete',
        '@codemirror/commands',
        '@codemirror/lang-json',
        '@codemirror/lang-markdown',
        '@codemirror/language',
        '@codemirror/state',
        '@codemirror/view',
        '@milkdown/core',
        '@milkdown/preset-commonmark',
        '@milkdown/preset-gfm',
        '@milkdown/prose/history',
        '@milkdown/prose/keymap',
        '@milkdown/prose/state',
      ]),
    );
    expect(rendererConfig.optimizeDeps?.include).toEqual(
      expect.arrayContaining(['@neko/entity-domain', '@neko/preview-domain/authorized-session']),
    );
  });
});
