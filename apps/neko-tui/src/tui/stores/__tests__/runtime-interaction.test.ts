import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentStore, type AgentStore } from '../agent-store';
import { createUIStore, type UIStore } from '../ui-store';

let agentStore: AgentStore;
let uiStore: UIStore;

describe('TUI runtime interaction state', () => {
  beforeEach(() => {
    agentStore = createAgentStore();
    uiStore = createUIStore({ rows: 24, columns: 80 });
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps one turn start time while running and clears it when the turn becomes idle', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(5_000);

    agentStore.getState().setRunning();
    expect(agentStore.getState()).toMatchObject({ status: 'running', startTime: 1_000 });

    agentStore.getState().setRunning();
    expect(agentStore.getState()).toMatchObject({ status: 'running', startTime: 1_000 });

    agentStore.getState().setIdle();
    expect(agentStore.getState()).toMatchObject({ status: 'idle', startTime: null });
  });

  it('defines scroll offset as rows above the live bottom', () => {
    uiStore.getState().setScrollLimit(10);
    uiStore.getState().scrollUp(6);
    expect(uiStore.getState().scrollOffset).toBe(6);

    uiStore.getState().setScrollLimit(14);
    expect(uiStore.getState().scrollOffset).toBe(10);

    uiStore.getState().scrollDown(2);
    expect(uiStore.getState().scrollOffset).toBe(8);

    uiStore.getState().scrollToBottom();
    expect(uiStore.getState().scrollOffset).toBe(0);
  });
});
