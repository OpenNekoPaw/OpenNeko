import type { AgentCapabilityActivationProgressEvent } from '@neko/shared';

export interface ActivationProgressTimeline {
  readonly conversationId: string;
  readonly activationId: string;
  readonly target: AgentCapabilityActivationProgressEvent['target'];
  readonly action: AgentCapabilityActivationProgressEvent['action'];
  readonly name: string;
  readonly source: AgentCapabilityActivationProgressEvent['source'];
  readonly requestedBy: AgentCapabilityActivationProgressEvent['requestedBy'];
  readonly reason?: string;
  readonly status: AgentCapabilityActivationProgressEvent['status'];
  readonly events: readonly AgentCapabilityActivationProgressEvent[];
}

export function mergeActivationProgressEvents(input: {
  readonly current: readonly ActivationProgressTimeline[];
  readonly conversationId: string;
  readonly events: readonly AgentCapabilityActivationProgressEvent[];
}): readonly ActivationProgressTimeline[] {
  if (input.events.length === 0) return input.current;

  const timelines = new Map<string, ActivationProgressTimeline>();
  for (const timeline of input.current) {
    timelines.set(timeline.activationId, timeline);
  }

  for (const event of input.events) {
    if (event.conversationId !== input.conversationId) continue;
    const existing = timelines.get(event.activationId);
    const events = sortActivationEvents([...(existing?.events ?? []), event]);
    timelines.set(event.activationId, projectTimeline(input.conversationId, events));
  }

  return [...timelines.values()].sort(compareTimeline);
}

function projectTimeline(
  conversationId: string,
  events: readonly AgentCapabilityActivationProgressEvent[],
): ActivationProgressTimeline {
  const latest = events[events.length - 1];
  if (!latest) {
    throw new Error('Cannot project empty activation progress timeline');
  }
  return {
    conversationId,
    activationId: latest.activationId,
    target: latest.target,
    action: latest.action,
    name: latest.name,
    source: latest.source,
    requestedBy: latest.requestedBy,
    ...(latest.reason !== undefined ? { reason: latest.reason } : {}),
    status: latest.status,
    events,
  };
}

function sortActivationEvents(
  events: readonly AgentCapabilityActivationProgressEvent[],
): readonly AgentCapabilityActivationProgressEvent[] {
  return [...events].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
}

function compareTimeline(
  left: ActivationProgressTimeline,
  right: ActivationProgressTimeline,
): number {
  const leftLatest = left.events[left.events.length - 1]?.at ?? 0;
  const rightLatest = right.events[right.events.length - 1]?.at ?? 0;
  return rightLatest - leftLatest || left.activationId.localeCompare(right.activationId);
}
