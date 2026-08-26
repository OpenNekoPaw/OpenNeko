import type { DshSessionHostEvent } from '@neko/agent-contracts/dsh-session-host';

type AssistantMessageEvent = Extract<
  DshSessionHostEvent,
  { readonly kind: 'message'; readonly role: 'assistant' }
>;

export type ToolEvent = Extract<DshSessionHostEvent, { readonly kind: 'tool' }>;

export type DshTranscriptPresentationItem =
  | {
      readonly kind: 'event';
      readonly event: DshSessionHostEvent;
      readonly sourceIndex: number;
    }
  | {
      readonly kind: 'progress-note';
      readonly event: AssistantMessageEvent;
      readonly sourceIndex: number;
    }
  | {
      readonly kind: 'tool-group';
      readonly turn: number;
      readonly tools: readonly ToolEvent[];
      readonly sourceIndex: number;
      readonly hasProcessNote: boolean;
    };

interface ToolLifecycle {
  readonly event: ToolEvent;
  readonly sourceIndex: number;
}

export function projectDshTranscriptPresentation(
  events: readonly DshSessionHostEvent[],
): readonly DshTranscriptPresentationItem[] {
  const progressMessageIndexes = new Set<number>();
  const turnsWithProcessNotes = new Set<number>();
  const toolLifecycles = indexToolLifecycles(events);

  events.forEach((event, index) => {
    if (!isAssistantProgressMessage(events, index, event)) return;
    progressMessageIndexes.add(index);
    turnsWithProcessNotes.add(event.turn);
  });

  const items: DshTranscriptPresentationItem[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) {
      throw new Error(`DSH transcript event ${index} is missing.`);
    }
    if (progressMessageIndexes.has(index)) {
      if (event.kind !== 'message' || event.role !== 'assistant') {
        throw new Error('DSH transcript progress classification lost its assistant message.');
      }
      items.push({ kind: 'progress-note', event, sourceIndex: index });
      continue;
    }
    if (event.kind !== 'tool') {
      items.push({ kind: 'event', event, sourceIndex: index });
      continue;
    }

    const lifecycle = getToolLifecycle(toolLifecycles, event);
    if (lifecycle.sourceIndex !== index) continue;

    const tools: ToolEvent[] = [];
    let cursor = index;
    while (cursor < events.length) {
      const candidate = events[cursor];
      if (candidate === undefined) {
        throw new Error(`DSH transcript event ${cursor} is missing.`);
      }
      if (candidate.kind !== 'tool' || candidate.turn !== event.turn) break;
      const candidateLifecycle = getToolLifecycle(toolLifecycles, candidate);
      if (candidateLifecycle.sourceIndex === cursor) tools.push(candidateLifecycle.event);
      cursor += 1;
    }
    items.push({
      kind: 'tool-group',
      turn: event.turn,
      tools,
      sourceIndex: index,
      hasProcessNote: turnsWithProcessNotes.has(event.turn),
    });
    index = cursor - 1;
  }
  return items;
}

function isAssistantProgressMessage(
  events: readonly DshSessionHostEvent[],
  index: number,
  event: DshSessionHostEvent,
): event is AssistantMessageEvent {
  if (event.kind !== 'message' || event.role !== 'assistant' || event.artifact !== undefined) {
    return false;
  }
  for (let cursor = index + 1; cursor < events.length; cursor += 1) {
    const candidate = events[cursor];
    if (candidate === undefined) {
      throw new Error(`DSH transcript event ${cursor} is missing.`);
    }
    if (candidate.kind === 'turn' && candidate.phase === 'end' && candidate.turn === event.turn) {
      return false;
    }
    if (candidate.kind === 'tool' && candidate.turn === event.turn) return true;
  }
  return false;
}

function indexToolLifecycles(
  events: readonly DshSessionHostEvent[],
): ReadonlyMap<number, ReadonlyMap<string, ToolLifecycle>> {
  const lifecyclesByTurn = new Map<number, Map<string, ToolLifecycle>>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) {
      throw new Error(`DSH transcript event ${index} is missing.`);
    }
    if (event.kind !== 'tool') continue;

    let lifecycles = lifecyclesByTurn.get(event.turn);
    if (lifecycles === undefined) {
      lifecycles = new Map();
      lifecyclesByTurn.set(event.turn, lifecycles);
    }
    const existing = lifecycles.get(event.toolCallId);
    lifecycles.set(event.toolCallId, {
      sourceIndex: existing?.sourceIndex ?? index,
      event: mergeToolLifecycleEvent(existing?.event, event),
    });
  }
  return lifecyclesByTurn;
}

function getToolLifecycle(
  lifecyclesByTurn: ReadonlyMap<number, ReadonlyMap<string, ToolLifecycle>>,
  event: ToolEvent,
): ToolLifecycle {
  const lifecycle = lifecyclesByTurn.get(event.turn)?.get(event.toolCallId);
  if (lifecycle === undefined) {
    throw new Error(
      `DSH transcript Tool '${event.toolCallId}' in Turn ${event.turn} lost its lifecycle.`,
    );
  }
  return lifecycle;
}

function mergeToolLifecycleEvent(existing: ToolEvent | undefined, event: ToolEvent): ToolEvent {
  return {
    ...existing,
    ...event,
    ...(event.rawInput === undefined && existing?.rawInput !== undefined
      ? { rawInput: existing.rawInput }
      : {}),
    ...(event.rawOutput === undefined && existing?.rawOutput !== undefined
      ? { rawOutput: existing.rawOutput }
      : {}),
  };
}
