import type {
  PiProductAgentEvent,
  PiProductEventSink,
  PiToolRunIdentity,
} from '@neko/agent-runtime/pi';

export function createDeferredDesktopAgentFactsEvents(): {
  readonly events: PiProductEventSink;
  bind(identity: PiToolRunIdentity, sink: PiProductEventSink): void;
  requireBound(identity: PiToolRunIdentity): void;
} {
  const buffered: PiProductAgentEvent[] = [];
  let target: PiProductEventSink | undefined;
  let targetIdentity: PiToolRunIdentity | undefined;
  return {
    events: {
      emit(event) {
        if (!target) {
          buffered.push(event);
          return;
        }
        return target.emit(event);
      },
    },
    bind(identity, sink) {
      if (target) throw new Error('Desktop Agent facts event sink is already bound.');
      target = sink;
      targetIdentity = identity;
      for (const event of buffered.splice(0)) {
        const result = target.emit(event);
        if (result instanceof Promise) {
          throw new Error(
            'Desktop Agent facts projector must consume buffered events synchronously.',
          );
        }
      }
    },
    requireBound(identity) {
      if (!target || !targetIdentity) {
        throw new Error(
          `Desktop Agent runtime completed turn '${identity.conversationId}/${identity.turnId}/${identity.runId}' without composing its final system prompt.`,
        );
      }
      if (
        targetIdentity.workspaceId !== identity.workspaceId ||
        targetIdentity.conversationId !== identity.conversationId ||
        targetIdentity.branchId !== identity.branchId ||
        targetIdentity.turnId !== identity.turnId ||
        targetIdentity.runId !== identity.runId
      ) {
        throw new Error(
          `Desktop Agent final system prompt identity '${targetIdentity.conversationId}/${targetIdentity.turnId}/${targetIdentity.runId}' does not match completed turn '${identity.conversationId}/${identity.turnId}/${identity.runId}'.`,
        );
      }
    },
  };
}
