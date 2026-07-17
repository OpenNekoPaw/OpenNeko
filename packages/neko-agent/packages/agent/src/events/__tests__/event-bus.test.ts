import { describe, expect, it, vi } from 'vitest';
import { AGENT_RUNTIME_CHANNELS, createEventBus, type AgentEventBusEvent } from '../event-bus';

function approvalDecided(subject = 'tool:Write', at = 1): AgentEventBusEvent {
  return {
    channel: AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
    subject,
    decision: 'accept',
    at,
  };
}

function stepCompleted(round = 0, at = 1): AgentEventBusEvent {
  return {
    channel: AGENT_RUNTIME_CHANNELS.STEP_COMPLETED,
    round,
    thinkOnly: false,
    at,
  };
}

describe('EventBus', () => {
  it('dispatches ordinary Agent runtime channels independently', () => {
    const bus = createEventBus();
    const approval = vi.fn();
    const step = vi.fn();
    bus.on(AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED, approval);
    bus.on(AGENT_RUNTIME_CHANNELS.STEP_COMPLETED, step);

    bus.emit(approvalDecided());
    bus.emit(stepCompleted());

    expect(approval).toHaveBeenCalledOnce();
    expect(step).toHaveBeenCalledOnce();
  });

  it('narrows typed payloads by channel', () => {
    const bus = createEventBus();
    bus.on(AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED, (event) => {
      expect(event.subject).toBe('tool:Write');
    });
    bus.emit(approvalDecided());
  });

  it('isolates listeners and supports any, unsubscribe, clear, and counts', () => {
    const bus = createEventBus();
    const good = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const any = vi.fn();
    const offBad = bus.on(AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED, bad);
    bus.on(AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED, good);
    bus.onAny(any);

    expect(bus.listenerCount(AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED)).toBe(2);
    expect(() => bus.emit(approvalDecided())).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    expect(any).toHaveBeenCalledOnce();

    offBad();
    expect(bus.listenerCount(AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED)).toBe(1);
    bus.clear();
    bus.emit(approvalDecided());
    expect(good).toHaveBeenCalledOnce();
    expect(any).toHaveBeenCalledOnce();
  });
});
