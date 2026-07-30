import type { AutohealRuntimeEvent } from '@neko/shared/types/agent-autoheal';
import { getLogger } from '../utils/logger';

const logger = getLogger('EventBus');

export const AGENT_RUNTIME_CHANNELS = {
  APPROVAL_DECIDED: 'agent.approval.decided',
  TOOL_COMMITTED: 'agent.tool.committed',
  STEP_COMPLETED: 'agent.step.completed',
} as const;

export type AgentRuntimeChannel =
  (typeof AGENT_RUNTIME_CHANNELS)[keyof typeof AGENT_RUNTIME_CHANNELS];

export type AgentRuntimeEvent =
  | {
      readonly channel: typeof AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED;
      readonly subject: string;
      readonly decision: 'accept' | 'reject' | 'auto-approved';
      readonly at: number;
    }
  | {
      readonly channel: typeof AGENT_RUNTIME_CHANNELS.TOOL_COMMITTED;
      readonly subject: string;
      readonly at: number;
    }
  | {
      readonly channel: typeof AGENT_RUNTIME_CHANNELS.STEP_COMPLETED;
      readonly round: number;
      readonly thinkOnly: boolean;
      readonly at: number;
    };

export type AgentEventBusEvent = AgentRuntimeEvent | AutohealRuntimeEvent;
export type AgentEventBusChannel = AgentEventBusEvent['channel'];

export type ChannelListener<E extends AgentEventBusEvent> = (event: E) => void;
export type AnyListener = (event: AgentEventBusEvent) => void;

export interface IEventBus {
  on<C extends AgentEventBusChannel>(
    channel: C,
    listener: (event: AgentEventBusEvent & { readonly channel: C }) => void,
  ): () => void;
  onAny(listener: AnyListener): () => void;
  emit(event: AgentEventBusEvent): void;
  clear(): void;
  listenerCount(channel: AgentEventBusChannel): number;
}

class EventBus implements IEventBus {
  private readonly channels = new Map<string, Set<AnyListener>>();
  private readonly anyListeners = new Set<AnyListener>();

  on<C extends AgentEventBusChannel>(
    channel: C,
    listener: (event: AgentEventBusEvent & { readonly channel: C }) => void,
  ): () => void {
    const generic = listener as AnyListener;
    const listeners = this.channels.get(channel) ?? new Set<AnyListener>();
    listeners.add(generic);
    this.channels.set(channel, listeners);
    return () => {
      listeners.delete(generic);
      if (listeners.size === 0) this.channels.delete(channel);
    };
  }

  onAny(listener: AnyListener): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  emit(event: AgentEventBusEvent): void {
    for (const listener of this.channels.get(event.channel) ?? []) {
      this.dispatch(listener, event);
    }
    for (const listener of this.anyListeners) {
      this.dispatch(listener, event);
    }
  }

  clear(): void {
    this.channels.clear();
    this.anyListeners.clear();
  }

  listenerCount(channel: AgentEventBusChannel): number {
    return this.channels.get(channel)?.size ?? 0;
  }

  private dispatch(listener: AnyListener, event: AgentEventBusEvent): void {
    try {
      listener(event);
    } catch (error) {
      logger.warn(`Listener on channel ${event.channel} threw: ${String(error)}`);
    }
  }
}

export function createEventBus(): IEventBus {
  return new EventBus();
}
