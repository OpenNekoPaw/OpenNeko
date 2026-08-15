import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabRenderRuntimeRegistry } from '../tab-render-runtime';
import {
  createTabRenderRealmStateCoordinator,
  parseTabRenderRealmState,
  readAgentEntryDraftSnapshot,
  writeAgentEntryDraftSnapshot,
  type AgentEntryDraftSnapshot,
  type TabRenderDraftSnapshot,
  type TabRenderRealmStateHost,
} from '../tab-render-realm-state';

afterEach(() => vi.useRealTimers());

describe('Tab render realm state', () => {
  it('restores drafts by complete Tab binding and coalesces subsequent writes', () => {
    vi.useFakeTimers();
    const host = createHost({
      drafts: [draft('tab-a', 'conv-a', 'draft-a'), draft('tab-b', 'conv-b', 'draft-b')],
    });
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    coordinator.reconcile([
      { tabId: 'tab-a', conversationId: 'conv-a' },
      { tabId: 'tab-b', conversationId: 'conv-b' },
    ]);

    expect(registry.require('tab-a').store.getSnapshot().state.inputValue).toBe('draft-a');
    expect(registry.require('tab-b').store.getSnapshot().state.inputValue).toBe('draft-b');
    expect(host.setState).not.toHaveBeenCalled();

    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-b',
    );
    expect(host.setState).not.toHaveBeenCalled();

    registry.require('tab-a').store.updateState({ inputValue: 'draft-a-1' });
    registry.require('tab-a').store.updateState({ inputValue: 'draft-a-2' });
    expect(host.setState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(host.setState).toHaveBeenCalledTimes(1);
    expect(host.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        drafts: expect.arrayContaining([
          expect.objectContaining({
            tabId: 'tab-a',
            conversationId: 'conv-a',
            inputValue: 'draft-a-2',
          }),
          expect.objectContaining({
            tabId: 'tab-b',
            conversationId: 'conv-b',
            inputValue: 'draft-b',
          }),
        ]),
      }),
    );

    coordinator.dispose();
    registry.dispose();
  });

  it('rejects only a persisted draft owned by another conversation', () => {
    const host = createHost({
      drafts: [draft('tab-a', 'conv-stale', 'stale'), draft('tab-b', 'conv-b', 'valid')],
    });
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    expect(() =>
      coordinator.reconcile([
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ]),
    ).not.toThrow();
    expect(registry.require('tab-a').store.getSnapshot().state.inputValue).toBe('');
    expect(registry.require('tab-b').store.getSnapshot().state.inputValue).toBe('valid');
    expect(coordinator.getDiagnostics()).toEqual([
      expect.objectContaining({ code: 'draft-owner-mismatch', tabId: 'tab-a' }),
    ]);

    coordinator.dispose();
    registry.dispose();
  });

  it('removes only a closed Tab draft and flushes pending state during disposal', () => {
    vi.useFakeTimers();
    const host = createHost({
      drafts: [draft('tab-a', 'conv-a', 'draft-a'), draft('tab-b', 'conv-b', 'draft-b')],
    });
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);
    coordinator.reconcile([
      { tabId: 'tab-a', conversationId: 'conv-a' },
      { tabId: 'tab-b', conversationId: 'conv-b' },
    ]);

    registry.reconcile([{ tabId: 'tab-b', conversationId: 'conv-b' }], 'tab-b');
    coordinator.reconcile([{ tabId: 'tab-b', conversationId: 'conv-b' }]);
    coordinator.dispose();

    expect(host.setState).toHaveBeenCalledTimes(1);
    expect(host.setState).toHaveBeenCalledWith({
      drafts: [expect.objectContaining({ tabId: 'tab-b', conversationId: 'conv-b' })],
    });
    registry.dispose();
  });

  it('rejects one malformed draft while restoring valid siblings', () => {
    const parsed = parseTabRenderRealmState({
      drafts: [
        { ...draft('tab-a', 'conv-a', 'draft'), viewport: { followMode: 'sideways' } },
        draft('tab-b', 'conv-b', 'valid'),
      ],
    });

    expect(parsed.state).toEqual({ drafts: [draft('tab-b', 'conv-b', 'valid')] });
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-draft',
        draftIndex: 0,
        tabId: 'tab-a',
        message: expect.stringContaining('viewport.followMode has an unsupported value'),
      }),
    ]);
  });

  it('leaves an unrelated historical state untouched and reports a realm-local diagnostic', () => {
    const persistedState = { unrelatedState: [{ marker: 'opaque' }] };
    const host = createHost(persistedState);
    const registry = createTabRenderRuntimeRegistry();

    const coordinator = createTabRenderRealmStateCoordinator(host.adapter, registry);

    expect(host.setState).not.toHaveBeenCalled();
    expect(host.reportStateDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'invalid-realm-state' }),
    );
    expect(coordinator.getDiagnostics()).toHaveLength(1);
    coordinator.dispose();
    registry.dispose();
  });

  it('keeps the surface available for invalid top-level state', () => {
    expect(parseTabRenderRealmState({ openTabs: [] })).toEqual({
      state: { drafts: [] },
      diagnostics: [
        {
          code: 'invalid-realm-state',
          message: 'Agent Tab render realm state drafts must be an array.',
        },
      ],
    });
  });

  it('restores one exact entry draft and isolates an owner mismatch', () => {
    const stored = entryDraft('draft-a', 'continue the scene');
    const host = createMutableHost({ drafts: [], entryDraft: stored });

    expect(readAgentEntryDraftSnapshot(host.adapter, 'draft-a')).toEqual({
      snapshot: stored,
      diagnostics: [],
    });
    expect(readAgentEntryDraftSnapshot(host.adapter, 'draft-b')).toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'entry-draft-owner-mismatch',
          message: expect.stringContaining('draft-a'),
        }),
      ],
    });
    expect(host.state).toEqual({ drafts: [], entryDraft: stored });
  });

  it('writes and clears only the entry draft while preserving Tab drafts', () => {
    const tabDraft = draft('tab-a', 'conv-a', 'tab text');
    const host = createMutableHost({ drafts: [tabDraft] });
    const stored = entryDraft('draft-a', 'entry text');

    writeAgentEntryDraftSnapshot(host.adapter, stored);
    expect(host.state).toEqual({ drafts: [tabDraft], entryDraft: stored });

    writeAgentEntryDraftSnapshot(host.adapter, undefined);
    expect(host.state).toEqual({ drafts: [tabDraft] });
  });

  it('isolates an invalid entry draft without dropping valid Tab drafts', () => {
    const tabDraft = draft('tab-a', 'conv-a', 'tab text');
    const parsed = parseTabRenderRealmState({
      drafts: [tabDraft],
      entryDraft: {
        ...entryDraft('draft-a', 'entry text'),
        draftId: '',
      },
    });

    expect(parsed.state).toEqual({ drafts: [tabDraft] });
    expect(parsed.diagnostics).toEqual([expect.objectContaining({ code: 'invalid-entry-draft' })]);
  });

  it('restores Authoring mode and exact Workspace target as Draft presentation state', () => {
    const stored = {
      ...entryDraft('draft-workspace', 'keep this text'),
      entryMode: 'authoring' as const,
      workspaceTarget: {
        label: 'OpenNeko',
        context: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        target: { kind: 'content-document' as const, documentId: 'documents/story.md' },
        authority: { kind: 'project' as const, projectId: 'project-1' },
      },
    };

    expect(parseTabRenderRealmState({ drafts: [], entryDraft: stored })).toEqual({
      state: { drafts: [], entryDraft: stored },
      diagnostics: [],
    });
  });

  it('restores an exact Project-only Creation context without fabricating a domain target', () => {
    const stored = {
      ...entryDraft('draft-project', 'create a setting'),
      entryMode: 'authoring' as const,
      workspaceTarget: {
        label: 'OpenNeko',
        context: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        authority: { kind: 'project' as const, projectId: 'project-1' },
      },
    };

    expect(parseTabRenderRealmState({ drafts: [], entryDraft: stored })).toEqual({
      state: { drafts: [], entryDraft: stored },
      diagnostics: [],
    });
  });

  it('restores multiple Characters and one exact World together', () => {
    const stored = {
      ...entryDraft('draft-world', 'begin the scene'),
      entryMode: 'character-dialogue' as const,
      characterLaunches: [
        {
          globalCharacterId: 'global-character-1',
          characterVersionId: 'character-version-1',
          label: 'Aster',
        },
        {
          globalCharacterId: 'global-character-2',
          characterVersionId: 'character-version-2',
          label: 'Beryl',
        },
      ],
      worldLaunch: {
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-1',
        label: 'Rain Station',
        versionLabel: 'Published v1',
      },
    };

    expect(parseTabRenderRealmState({ drafts: [], entryDraft: stored })).toEqual({
      state: { drafts: [], entryDraft: stored },
      diagnostics: [],
    });
  });

  it('resets only an invalid entry mode while preserving valid Draft text', () => {
    const parsed = parseTabRenderRealmState({
      drafts: [],
      entryDraft: { ...entryDraft('draft-a', 'preserved'), entryMode: 'management' },
    });

    expect(parsed.state.entryDraft).toMatchObject({
      draftId: 'draft-a',
      inputValue: 'preserved',
    });
    expect(parsed.state.entryDraft).not.toHaveProperty('entryMode');
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-entry-draft',
        message: expect.stringContaining('entryMode'),
      }),
    ]);
  });
});

function createHost(state: unknown): {
  readonly adapter: TabRenderRealmStateHost;
  readonly setState: ReturnType<typeof vi.fn>;
  readonly reportStateDiagnostic: ReturnType<typeof vi.fn>;
} {
  const setState = vi.fn();
  const reportStateDiagnostic = vi.fn();
  return {
    setState,
    reportStateDiagnostic,
    adapter: {
      getState: () => state,
      setState,
      reportStateDiagnostic,
    },
  };
}

function draft(tabId: string, conversationId: string, inputValue: string): TabRenderDraftSnapshot {
  return {
    tabId,
    conversationId,
    inputValue,
    viewport: { followMode: 'follow-tail' },
  };
}

function entryDraft(draftId: string, inputValue: string): AgentEntryDraftSnapshot {
  return {
    draftId,
    inputValue,
    contextReferences: [],
    characterLaunches: [],
    selectedModel: 'test:test-model',
    mediaModelSelection: {
      image: 'test:image-model',
      video: 'none',
      audio: 'test:audio-model',
    },
    executionMode: 'ask',
  };
}

function createMutableHost(initialState: unknown): {
  readonly adapter: TabRenderRealmStateHost;
  readonly state: unknown;
} {
  let state = initialState;
  return {
    get state() {
      return state;
    },
    adapter: {
      getState: () => state,
      setState: (next) => {
        state = next;
      },
    },
  };
}
