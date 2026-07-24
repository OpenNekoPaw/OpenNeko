import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtensionToWebviewMessage } from '@neko-agent/types';
import type {
  DomainActivityCommand,
  DomainActivityItem,
  DomainActivitySnapshot,
} from '@neko/shared/domain-activity';
import { AgentHostMessages } from '@/messages';

export interface DomainActivityReplicaState {
  readonly phase: 'attaching' | 'live' | 'fatal';
  readonly snapshot: DomainActivitySnapshot;
  readonly diagnostic?: string;
  readonly pendingJobKeys: readonly string[];
}

const EMPTY_SNAPSHOT: DomainActivitySnapshot = Object.freeze({
  projectionVersion: 0,
  items: Object.freeze([]),
});

export function useDomainActivity(): {
  readonly state: DomainActivityReplicaState;
  readonly execute: (item: DomainActivityItem, command: DomainActivityCommand) => void;
} {
  const attachmentIdRef = useRef(`domain-activity-${crypto.randomUUID()}`);
  const sequenceRef = useRef(0);
  const pendingRequestsRef = useRef(new Map<string, string>());
  const [state, setState] = useState<DomainActivityReplicaState>({
    phase: 'attaching',
    snapshot: EMPTY_SNAPSHOT,
    pendingJobKeys: Object.freeze([]),
  });

  useEffect(() => {
    const attachmentId = attachmentIdRef.current;
    const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'domainActivitySnapshot') {
        if (message.key.attachmentId !== attachmentId || message.sequence !== 0) return;
        sequenceRef.current = 0;
        setState((current) => ({
          phase: 'live',
          snapshot: message.snapshot,
          pendingJobKeys: current.pendingJobKeys,
        }));
        AgentHostMessages.acknowledgeDomainActivity(
          attachmentId,
          0,
          message.snapshot.projectionVersion,
        );
        return;
      }
      if (message.type === 'domainActivityPatch') {
        if (message.key.attachmentId !== attachmentId) return;
        setState((current) => {
          if (
            current.phase !== 'live' ||
            message.sequence !== sequenceRef.current + 1 ||
            message.patch.baseProjectionVersion !== current.snapshot.projectionVersion
          ) {
            AgentHostMessages.attachDomainActivity(attachmentId);
            return {
              ...current,
              phase: 'attaching',
              diagnostic: 'Domain Activity revision gap; requesting a replacement snapshot.',
            };
          }
          sequenceRef.current = message.sequence;
          const next = applyActivityPatch(current.snapshot, message.patch);
          AgentHostMessages.acknowledgeDomainActivity(
            attachmentId,
            message.sequence,
            next.projectionVersion,
          );
          return { ...current, phase: 'live', snapshot: next, diagnostic: undefined };
        });
        return;
      }
      if (message.type === 'domainActivityDiagnostic') {
        if (message.key.attachmentId !== attachmentId) return;
        setState((current) => ({
          ...current,
          phase: 'fatal',
          diagnostic: message.message,
        }));
        return;
      }
      if (message.type === 'domainJobCommandResult') {
        const jobKey = pendingRequestsRef.current.get(message.requestId);
        if (!jobKey) return;
        pendingRequestsRef.current.delete(message.requestId);
        setState((current) => ({
          ...current,
          pendingJobKeys: Object.freeze(
            current.pendingJobKeys.filter((candidate) => candidate !== jobKey),
          ),
          ...(message.success ? { diagnostic: undefined } : { diagnostic: message.error }),
        }));
      }
    };

    window.addEventListener('message', listener);
    AgentHostMessages.attachDomainActivity(attachmentId);
    return () => {
      window.removeEventListener('message', listener);
      AgentHostMessages.detachDomainActivity(attachmentId);
    };
  }, []);

  const execute = useCallback((item: DomainActivityItem, command: DomainActivityCommand) => {
    const requestId = crypto.randomUUID();
    const jobKey = `${item.jobKind}:${item.jobId}`;
    pendingRequestsRef.current.set(requestId, jobKey);
    setState((current) => ({
      ...current,
      pendingJobKeys: current.pendingJobKeys.includes(jobKey)
        ? current.pendingJobKeys
        : Object.freeze([...current.pendingJobKeys, jobKey]),
      diagnostic: undefined,
    }));
    AgentHostMessages.commandDomainJob({
      requestId,
      jobKind: item.jobKind,
      jobId: item.jobId,
      expectedRevision: item.jobRevision,
      command,
    });
  }, []);

  return { state, execute };
}

function applyActivityPatch(
  snapshot: DomainActivitySnapshot,
  patch: import('@neko/shared/domain-activity').DomainActivityPatch,
): DomainActivitySnapshot {
  const items = new Map(
    snapshot.items.map((item) => [`${item.jobKind}:${item.jobId}`, item] as const),
  );
  for (const ref of patch.removed) items.delete(`${ref.kind}:${ref.jobId}`);
  for (const item of patch.upserts) items.set(`${item.jobKind}:${item.jobId}`, item);
  return Object.freeze({
    projectionVersion: patch.projectionVersion,
    items: Object.freeze(
      [...items.values()].sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          `${left.jobKind}:${left.jobId}`.localeCompare(`${right.jobKind}:${right.jobId}`),
      ),
    ),
  });
}
