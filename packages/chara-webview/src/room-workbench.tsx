import type {
  CharacterRoomWorkbenchProjection,
  OpenNekoDesktopCharacterRoomWorkbenchBridge,
  RoomEvent,
} from '@neko/chara/contracts';
import { ClockIcon, MessageIcon, UsersIcon, WarningIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useEffect, useRef, useState } from 'react';
import { foundationLabel } from './labels';

export type CharacterRoomWorkbenchLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly projection: CharacterRoomWorkbenchProjection };

export function useCharacterRoomWorkbenchRuntime(input: {
  readonly active: boolean;
  readonly roomRunId?: string;
  readonly host?: OpenNekoDesktopCharacterRoomWorkbenchBridge['characterRoomWorkbench'];
}): CharacterRoomWorkbenchLoadState {
  const [state, setState] = useState<CharacterRoomWorkbenchLoadState>({ kind: 'idle' });
  const latestRoomPosition = useRef(-1);

  useEffect(() => {
    latestRoomPosition.current = -1;
    if (!input.active) {
      setState({ kind: 'idle' });
      return;
    }
    if (!input.roomRunId || !input.host) {
      setState({ kind: 'failed', message: 'Character Room Workbench Host port is unavailable.' });
      return;
    }

    let mounted = true;
    const accept = (projection: CharacterRoomWorkbenchProjection): void => {
      if (!mounted || projection.roomRevision < latestRoomPosition.current) return;
      latestRoomPosition.current = projection.roomRevision;
      setState({ kind: 'ready', projection });
    };
    setState({ kind: 'loading' });
    const unsubscribe = input.host.subscribe(input.roomRunId, (event) => {
      accept(event.projection);
    });
    void input.host
      .getSnapshot(input.roomRunId)
      .then(accept)
      .catch((error: unknown) => {
        if (mounted) setState({ kind: 'failed', message: describeError(error) });
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [input.active, input.host, input.roomRunId]);

  return state;
}

export function CharacterRoomInteractionFeed({
  locale,
  state,
}: {
  readonly locale: SupportedLocale;
  readonly state: CharacterRoomWorkbenchLoadState;
}): JSX.Element {
  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <RoomWorkbenchStatus>
        {foundationLabel(locale, '正在载入聊天室...', 'Loading room...')}
      </RoomWorkbenchStatus>
    );
  }
  if (state.kind === 'failed') {
    return <RoomWorkbenchStatus error>{state.message}</RoomWorkbenchStatus>;
  }

  const projection = state.projection;
  const messages = projection.events.filter(
    (event): event is Extract<RoomEvent, { readonly kind: 'message' }> => event.kind === 'message',
  );
  const participantNames = new Map(
    projection.participants.map((participant) => [
      participant.participantId,
      participant.displayName,
    ]),
  );
  return (
    <section
      className="character-room-feed"
      data-character-room-feed="true"
      data-room-revision={projection.roomRevision}
      data-room-run-id={projection.roomRunId}
    >
      {messages.length === 0 ? (
        <RoomWorkbenchStatus>
          {foundationLabel(locale, '聊天室已就绪', 'Room ready')}
        </RoomWorkbenchStatus>
      ) : (
        <ol className="character-room-feed__messages" aria-live="polite">
          {messages.map((event) => {
            const ownMessage = event.authorParticipantId === projection.participantId;
            return (
              <li
                className={ownMessage ? 'is-local-user' : undefined}
                data-room-event-id={event.roomEventId}
                key={event.roomEventId}
              >
                <div className="character-room-feed__message-meta">
                  <strong>
                    {participantNames.get(event.authorParticipantId) ?? event.authorParticipantId}
                  </strong>
                  <time dateTime={event.createdAt}>{formatTime(locale, event.createdAt)}</time>
                </div>
                <p>{event.content}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function CharacterRoomTimelineSurface({
  locale,
  state,
}: {
  readonly locale: SupportedLocale;
  readonly state: CharacterRoomWorkbenchLoadState;
}): JSX.Element {
  return (
    <section
      className="character-room-timeline"
      data-character-room-timeline="true"
      data-room-run-id={state.kind === 'ready' ? state.projection.roomRunId : undefined}
    >
      <header className="character-room-timeline__header">
        <ClockIcon size={16} />
        <strong>{foundationLabel(locale, '聊天室时间线', 'Room timeline')}</strong>
        {state.kind === 'ready' ? <span>{state.projection.roomRevision}</span> : null}
      </header>
      {state.kind === 'idle' || state.kind === 'loading' ? (
        <RoomWorkbenchStatus>
          {foundationLabel(locale, '正在载入时间线...', 'Loading timeline...')}
        </RoomWorkbenchStatus>
      ) : state.kind === 'failed' ? (
        <RoomWorkbenchStatus error>{state.message}</RoomWorkbenchStatus>
      ) : state.projection.events.length === 0 ? (
        <RoomWorkbenchStatus>
          {foundationLabel(locale, '尚无聊天室事件', 'No room events yet')}
        </RoomWorkbenchStatus>
      ) : (
        <ol className="character-room-timeline__events">
          {state.projection.events.map((event) => (
            <li data-room-event-kind={event.kind} key={event.roomEventId}>
              <span className="character-room-timeline__marker">
                {event.kind === 'message' ? <MessageIcon size={13} /> : <UsersIcon size={13} />}
              </span>
              <div>
                <strong>{timelineEventLabel(locale, event)}</strong>
                <small>{timelineEventDetail(state.projection, event)}</small>
              </div>
              <time dateTime={event.createdAt}>{formatTime(locale, event.createdAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RoomWorkbenchStatus({
  children,
  error = false,
}: {
  readonly children: string;
  readonly error?: boolean;
}): JSX.Element {
  return (
    <div className={`character-room-workbench__status${error ? ' is-error' : ''}`} role="status">
      {error ? <WarningIcon size={15} /> : null}
      <span>{children}</span>
    </div>
  );
}

function timelineEventLabel(locale: SupportedLocale, event: RoomEvent): string {
  switch (event.kind) {
    case 'message':
      return foundationLabel(locale, '消息', 'Message');
    case 'membership':
      return foundationLabel(locale, '成员变更', 'Membership');
    case 'moderation':
      return foundationLabel(locale, '内容管理', 'Moderation');
    case 'scheduling':
      return foundationLabel(locale, '角色调度', 'Character scheduling');
    case 'world-event-reference':
      return foundationLabel(locale, '世界事件', 'World event');
  }
}

function timelineEventDetail(
  projection: CharacterRoomWorkbenchProjection,
  event: RoomEvent,
): string {
  const participantName = (participantId: string): string =>
    projection.participants.find((participant) => participant.participantId === participantId)
      ?.displayName ?? participantId;
  switch (event.kind) {
    case 'message':
      return `${participantName(event.authorParticipantId)}: ${event.content}`;
    case 'membership':
      return `${participantName(event.participantId)} / ${event.action}`;
    case 'moderation':
      return `${participantName(event.moderatorParticipantId)} / ${event.action}`;
    case 'scheduling':
      return event.eligibleParticipantIds.map(participantName).join(', ');
    case 'world-event-reference':
      return event.worldEventId;
  }
}

function formatTime(locale: SupportedLocale, value: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
