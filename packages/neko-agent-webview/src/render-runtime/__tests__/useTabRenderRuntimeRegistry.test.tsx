import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpenTab } from '@neko-agent/types';
import { useTabRenderRuntimeRegistry } from '../useTabRenderRuntimeRegistry';
import { TAB_RENDER_REALM_STATE_VERSION } from '../tab-render-realm-state';

const tabA: OpenTab = { id: 'tab-a', title: 'A', conversationId: 'conv-a' };
const tabB: OpenTab = { id: 'tab-b', title: 'B', conversationId: 'conv-b' };

describe('useTabRenderRuntimeRegistry', () => {
  it('retains Tab runtimes across activation and disposes them with the Webview root', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ tabs, activeTabId }: { tabs: readonly OpenTab[]; activeTabId: string | null }) =>
        useTabRenderRuntimeRegistry(tabs, activeTabId),
      { initialProps: { tabs: [tabA, tabB], activeTabId: 'tab-a' } },
    );
    const runtimeA = result.current.require('tab-a');
    const runtimeB = result.current.require('tab-b');

    act(() => rerender({ tabs: [tabA, tabB], activeTabId: 'tab-b' }));

    expect(result.current.require('tab-a')).toBe(runtimeA);
    expect(result.current.require('tab-b')).toBe(runtimeB);
    expect(runtimeA.store.getSnapshot().visibility).toBe('hidden');
    expect(runtimeB.store.getSnapshot().visibility).toBe('visible');

    unmount();

    await waitFor(() => {
      expect(runtimeA.lifecycle).toBe('disposed');
      expect(runtimeB.lifecycle).toBe('disposed');
    });
  });

  it('preserves user draft settings while discarding retired runtime-only fields', () => {
    const getState = vi.fn(() => ({
      schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
      drafts: [
        {
          tabId: 'tab-a',
          conversationId: 'conv-a',
          inputValue: 'restored draft',
          selectedModel: 'provider:model',
          mediaModelSelection: { image: 'image:model', video: 'none', audio: 'none' },
          mediaUnderstandingSelection: { image: 'auto', video: 'auto', audio: 'auto' },
          sessionMode: 'agent',
          executionMode: 'ask',
          promptMode: 'default',
          idcRun: { id: 'retired-run' },
          stagePersona: 'creation-persona',
          checkpoint: { stage: 'plan' },
          generationCategory: 'image',
          generationParams: {
            ratio: '16:9',
            resolution: '1080p',
            videoDuration: 'auto',
            videoFps: 24,
            audioDuration: 'auto',
            audioType: 'sfx',
          },
          llmConfig: { reasoningPreset: 'deep' },
        },
      ],
    }));
    const host = {
      getState,
      setState: vi.fn(),
    };

    const { result, unmount } = renderHook(() =>
      useTabRenderRuntimeRegistry([tabA], 'tab-a', host),
    );

    const state = result.current.require('tab-a').store.getSnapshot().state;
    expect(state.inputValue).toBe('restored draft');
    expect(state.selectedModel).toBe('provider:model');
    expect(state.mediaModelSelection.image).toBe('image:model');
    expect(state.executionMode).toBe('ask');
    expect(state.llmConfig.reasoningPreset).toBe('deep');
    expect(state).not.toHaveProperty('promptMode');
    expect(state).not.toHaveProperty('idcRun');
    expect(state).not.toHaveProperty('stagePersona');
    expect(state).not.toHaveProperty('checkpoint');
    unmount();
  });
});
