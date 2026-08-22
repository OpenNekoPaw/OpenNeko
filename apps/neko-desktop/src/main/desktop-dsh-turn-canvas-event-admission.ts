import type { DshTurnCanvasTargetOwner } from '@neko/agent-runtime/application';

export async function resolveDesktopDshSessionEventAdmission<T>(input: {
  readonly event: { readonly sessionId: string; readonly type: string };
  readonly projection: {
    snapshot(dshSessionId: string): { readonly currentTurn?: number };
  };
  readonly targets: Pick<DshTurnCanvasTargetOwner, 'bindStartedTurn' | 'releaseTurn'>;
  readonly resolveBinding: () => Promise<T | undefined>;
}): Promise<{ readonly binding: T; readonly startedTurn?: number }> {
  let startedTurn: number | undefined;
  if (input.event.type === 'turn/start') {
    startedTurn = input.projection.snapshot(input.event.sessionId).currentTurn;
    if (startedTurn === undefined) {
      throw new Error('DSH turn/start has no projected current turn identity.');
    }
    // Projection accepted the event before this callback. Bind synchronously so a concurrent
    // completed Tool notification cannot overtake the asynchronous Conversation lookup.
    input.targets.bindStartedTurn(input.event.sessionId, startedTurn);
  }

  try {
    const binding = await input.resolveBinding();
    if (binding === undefined) {
      throw new Error(`DSH Session '${input.event.sessionId}' event has no Conversation binding.`);
    }
    return {
      binding,
      ...(startedTurn === undefined ? {} : { startedTurn }),
    };
  } catch (error) {
    if (startedTurn !== undefined) input.targets.releaseTurn(input.event.sessionId, startedTurn);
    throw error;
  }
}
