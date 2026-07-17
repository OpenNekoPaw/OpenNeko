import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { OpenTab } from '@neko-agent/types';
import { useTabManager } from '../useTabManager';

const vscodeMocks = vi.hoisted(() => ({
  activateConversation: vi.fn(),
  updateTabState: vi.fn(),
  exitCharacterDialogueSession: vi.fn(),
  exitEmbodyCharacterSession: vi.fn(),
  deleteConversation: vi.fn(),
  getTasks: vi.fn(),
}));

vi.mock('@/messages', () => ({
  AgentHostMessages: vscodeMocks,
  VSCodeMessages: vscodeMocks,
}));

describe('useTabManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('activates role tabs locally without switching the ordinary Agent conversation', () => {
    const roleTab: OpenTab = {
      id: 'tab-role',
      title: 'Character Dialogue: 小橘',
      conversationId: 'role-session-1',
      kind: 'character-dialogue',
    };
    const onActivateCharacterRoleTab = vi.fn();
    const setActiveTab = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-chat', title: 'Chat', conversationId: 'conv-a' },
        roleTab,
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-chat');

      return {
        activeTabId,
        ...useTabManager({
          openTabs,
          setOpenTabs,
          activeTabId,
          setActiveTabId,
          tabStateRevision: 0,
          onTabStateRevisionAllocated: vi.fn(),
          conversations: [{ id: 'conv-a', title: 'Chat', messageCount: 1, updatedAt: 1 }],
          setActiveTab,
          onActivateCharacterRoleTab,
        }),
      };
    });

    act(() => {
      result.current.handleSwitchTab('tab-role');
    });

    expect(result.current.activeTabId).toBe('tab-role');
    expect(onActivateCharacterRoleTab).toHaveBeenCalledWith(roleTab);
    expect(vscodeMocks.activateConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.getTasks).not.toHaveBeenCalled();
    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });

  it('switches ordinary tabs through the extension conversation route', () => {
    const onBeforeConversationActivation = vi.fn();
    const onActivateCharacterRoleTab = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-a');

      return {
        activeTabId,
        ...useTabManager({
          openTabs,
          setOpenTabs,
          activeTabId,
          setActiveTabId,
          tabStateRevision: 0,
          onTabStateRevisionAllocated: vi.fn(),
          conversations: [
            { id: 'conv-a', title: 'Chat A', messageCount: 1, updatedAt: 1 },
            { id: 'conv-b', title: 'Chat B', messageCount: 1, updatedAt: 2 },
          ],
          setActiveTab: vi.fn(),
          onBeforeConversationActivation,
          onActivateCharacterRoleTab,
        }),
      };
    });

    act(() => {
      result.current.handleSwitchTab('tab-b');
    });

    expect(result.current.activeTabId).toBe('tab-b');
    expect(onBeforeConversationActivation).toHaveBeenCalledWith({
      activationId: 1,
      conversationId: 'conv-b',
      tabId: 'tab-b',
      expectedTabStateRevision: 0,
    });
    expect(onActivateCharacterRoleTab).not.toHaveBeenCalled();
    expect(vscodeMocks.activateConversation).toHaveBeenCalledWith({
      activationId: 1,
      conversationId: 'conv-b',
      tabId: 'tab-b',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [
          { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
          { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
        ],
        activeTabId: 'tab-b',
      },
    });
    expect(vscodeMocks.updateTabState).not.toHaveBeenCalled();
  });

  it('reloads task snapshots when switching ordinary tabs', () => {
    const onConversationActivated = vi.fn((conversationId: string) => {
      vscodeMocks.getTasks(conversationId);
    });

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-a');

      return useTabManager({
        openTabs,
        setOpenTabs,
        activeTabId,
        setActiveTabId,
        tabStateRevision: 0,
        onTabStateRevisionAllocated: vi.fn(),
        conversations: [
          { id: 'conv-a', title: 'Chat A', messageCount: 1, updatedAt: 1 },
          { id: 'conv-b', title: 'Chat B', messageCount: 1, updatedAt: 2 },
        ],
        setActiveTab: vi.fn(),
        onConversationActivated,
      });
    });

    act(() => {
      result.current.handleSwitchTab('tab-b');
    });

    expect(onConversationActivated).toHaveBeenCalledWith('conv-b');
    expect(vscodeMocks.getTasks).toHaveBeenCalledWith('conv-b');
  });

  it('requests a config snapshot only when opening a new tab', () => {
    const onConfigSnapshotRequested = vi.fn();
    const onBeforeConversationActivation = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-a');

      return useTabManager({
        openTabs,
        setOpenTabs,
        activeTabId,
        setActiveTabId,
        tabStateRevision: 0,
        onTabStateRevisionAllocated: vi.fn(),
        conversations: [
          { id: 'conv-a', title: 'Chat A', messageCount: 1, updatedAt: 1 },
          { id: 'conv-b', title: 'Chat B', messageCount: 1, updatedAt: 2 },
        ],
        setActiveTab: vi.fn(),
        onConfigSnapshotRequested,
        onBeforeConversationActivation,
      });
    });

    act(() => {
      result.current.handleOpenTab('conv-a', 'Chat A');
    });
    expect(onConfigSnapshotRequested).not.toHaveBeenCalled();
    expect(onBeforeConversationActivation).toHaveBeenCalledWith({
      activationId: 1,
      conversationId: 'conv-a',
      tabId: 'tab-a',
      expectedTabStateRevision: 0,
    });

    act(() => {
      result.current.handleOpenTab('conv-b', 'Chat B');
    });
    expect(onConfigSnapshotRequested).toHaveBeenCalledTimes(1);
    expect(onBeforeConversationActivation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activationId: 2,
        conversationId: 'conv-b',
        expectedTabStateRevision: 1,
      }),
    );
  });

  it('does not delete a closed tab when the conversation summary is missing', () => {
    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Draft', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Next', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-b');

      return useTabManager({
        openTabs,
        setOpenTabs,
        activeTabId,
        setActiveTabId,
        tabStateRevision: 0,
        onTabStateRevisionAllocated: vi.fn(),
        conversations: [],
        setActiveTab: vi.fn(),
      });
    });

    act(() => {
      result.current.handleCloseTab('tab-a');
    });

    expect(vscodeMocks.deleteConversation).not.toHaveBeenCalled();
  });

  it('preserves locally active conversations when closing their tab', () => {
    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Draft', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Next', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-b');

      return useTabManager({
        openTabs,
        setOpenTabs,
        activeTabId,
        setActiveTabId,
        tabStateRevision: 0,
        onTabStateRevisionAllocated: vi.fn(),
        conversations: [{ id: 'conv-a', title: 'New Chat', messageCount: 0, updatedAt: 1 }],
        setActiveTab: vi.fn(),
        hasLocalConversationActivity: (conversationId) => conversationId === 'conv-a',
      });
    });

    act(() => {
      result.current.handleCloseTab('tab-a');
    });

    expect(vscodeMocks.deleteConversation).not.toHaveBeenCalled();
  });

  it('checks active-tab local activity without a foreground save callback', () => {
    const hasLocalConversationActivity = vi.fn(() => true);

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Draft', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Next', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-a');

      return useTabManager({
        openTabs,
        setOpenTabs,
        activeTabId,
        setActiveTabId,
        tabStateRevision: 0,
        onTabStateRevisionAllocated: vi.fn(),
        conversations: [{ id: 'conv-a', title: 'New Chat', messageCount: 0, updatedAt: 1 }],
        setActiveTab: vi.fn(),
        hasLocalConversationActivity,
      });
    });

    act(() => {
      result.current.handleCloseTab('tab-a');
    });

    expect(hasLocalConversationActivity).toHaveBeenCalledWith('conv-a');
    expect(vscodeMocks.deleteConversation).not.toHaveBeenCalled();
  });

  it('keeps the empty-tab cleanup behavior for confirmed empty conversations', () => {
    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'New Chat', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Next', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-b');

      return useTabManager({
        openTabs,
        setOpenTabs,
        activeTabId,
        setActiveTabId,
        tabStateRevision: 0,
        onTabStateRevisionAllocated: vi.fn(),
        conversations: [{ id: 'conv-a', title: 'New Chat', messageCount: 0, updatedAt: 1 }],
        setActiveTab: vi.fn(),
      });
    });

    act(() => {
      result.current.handleCloseTab('tab-a');
    });

    expect(vscodeMocks.deleteConversation).toHaveBeenCalledWith('conv-a', {
      activateNext: false,
    });
  });

  it('closes the final active tab into an explicit empty tab state', () => {
    const onAllTabsClosed = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'New Chat', conversationId: 'conv-a' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-a');

      return {
        activeTabId,
        openTabs,
        ...useTabManager({
          openTabs,
          setOpenTabs,
          activeTabId,
          setActiveTabId,
          tabStateRevision: 0,
          onTabStateRevisionAllocated: vi.fn(),
          conversations: [{ id: 'conv-a', title: 'New Chat', messageCount: 0, updatedAt: 1 }],
          setActiveTab: vi.fn(),
          onAllTabsClosed,
        }),
      };
    });

    act(() => {
      result.current.handleCloseTab('tab-a');
    });

    expect(result.current.openTabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
    expect(onAllTabsClosed).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.deleteConversation).toHaveBeenCalledWith('conv-a', {
      activateNext: false,
    });
    expect(vscodeMocks.activateConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.updateTabState).toHaveBeenCalledWith([], null, 0);
  });

  it('closes the final roleplay tab into an explicit empty tab state without restoring history', () => {
    const onAllTabsClosed = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        {
          id: 'tab-role',
          title: 'Character Dialogue: 小橘',
          conversationId: 'npc-session-1',
          kind: 'character-dialogue',
        },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-role');

      return {
        activeTabId,
        openTabs,
        ...useTabManager({
          openTabs,
          setOpenTabs,
          activeTabId,
          setActiveTabId,
          tabStateRevision: 0,
          onTabStateRevisionAllocated: vi.fn(),
          conversations: [{ id: 'conv-old', title: 'Old Chat', messageCount: 3, updatedAt: 1 }],
          setActiveTab: vi.fn(),
          onAllTabsClosed,
        }),
      };
    });

    act(() => {
      result.current.handleCloseTab('tab-role');
    });

    expect(result.current.openTabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
    expect(onAllTabsClosed).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.exitCharacterDialogueSession).toHaveBeenCalledWith('npc-session-1');
    expect(vscodeMocks.activateConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.deleteConversation).not.toHaveBeenCalled();
    expect(vscodeMocks.updateTabState).toHaveBeenCalledWith([], null, 0);
  });

  it('records the next ordinary conversation before closing the active tab switches to it', () => {
    const onBeforeConversationActivation = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-a');

      return useTabManager({
        openTabs,
        setOpenTabs,
        activeTabId,
        setActiveTabId,
        tabStateRevision: 0,
        onTabStateRevisionAllocated: vi.fn(),
        conversations: [
          { id: 'conv-a', title: 'Chat A', messageCount: 1, updatedAt: 1 },
          { id: 'conv-b', title: 'Chat B', messageCount: 1, updatedAt: 2 },
        ],
        setActiveTab: vi.fn(),
        onBeforeConversationActivation,
      });
    });

    act(() => {
      result.current.handleCloseTab('tab-a');
    });

    expect(onBeforeConversationActivation).toHaveBeenCalledWith({
      activationId: 1,
      conversationId: 'conv-b',
      tabId: 'tab-b',
      expectedTabStateRevision: 0,
    });
    expect(vscodeMocks.activateConversation).toHaveBeenCalledWith({
      activationId: 1,
      conversationId: 'conv-b',
      tabId: 'tab-b',
      expectedTabStateRevision: 0,
      tabState: {
        openTabs: [{ id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' }],
        activeTabId: 'tab-b',
      },
    });
    expect(vscodeMocks.updateTabState).not.toHaveBeenCalled();
  });
});
