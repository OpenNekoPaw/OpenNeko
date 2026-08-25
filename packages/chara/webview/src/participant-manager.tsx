import type {
  CharacterFoundationSnapshot,
  CharacterRepresentationKind,
  CharacterRun,
  RoomParticipant,
} from '@neko/chara-domain/contracts';
import { BotIcon, SearchIcon, StorylineIcon, UserIcon, UsersIcon, VolumeIcon } from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { foundationLabel } from './labels';

type CharacterPublication = CharacterFoundationSnapshot['character']['versions'][number];

export type CharacterParticipantManagerOwner =
  | { readonly kind: 'character'; readonly characterRunId: string }
  | { readonly kind: 'room'; readonly roomRunId: string };

export interface CharacterParticipantManagerProjection {
  readonly ownerKind: CharacterParticipantManagerOwner['kind'];
  readonly participants: readonly CharacterParticipantProjection[];
}

export interface CharacterParticipantProjection {
  readonly participantId: string;
  readonly displayName: string;
  readonly controllerKind: 'agent' | 'human' | 'system';
  readonly schedulingState: 'active' | 'paused';
  readonly character?: {
    readonly characterRunId?: string;
    readonly versionLabel: string;
    readonly mode?: 'companion' | 'narrative';
    readonly agentSessionBound: boolean;
    readonly tts?: {
      readonly autoRead: boolean;
      readonly speed: number;
    };
    readonly representationKind?: CharacterRepresentationKind;
    readonly portraitRepresentationId?: string;
    readonly storylineNodeTitle?: string;
  };
}

export function projectCharacterParticipantManager(
  snapshot: CharacterFoundationSnapshot,
  owner: CharacterParticipantManagerOwner,
): CharacterParticipantManagerProjection {
  if (owner.kind === 'character') {
    const run = requireRun(snapshot, owner.characterRunId);
    const publication = requirePublication(snapshot, run.characterVersionId);
    const globalCharacter = snapshot.character.globalCharacters.find(
      (candidate) => candidate.globalCharacterId === publication.globalCharacterId,
    );
    if (!globalCharacter) {
      throw new Error(
        `Character participant '${run.participantId}' has no exact GlobalCharacter authority.`,
      );
    }
    return {
      ownerKind: owner.kind,
      participants: [
        projectCharacterParticipant(
          snapshot,
          {
            participantId: run.participantId,
            displayName: globalCharacter.displayName,
            controller: run.controller,
          },
          run,
          publication,
          true,
        ),
      ],
    };
  }

  const roomRun = snapshot.character.roomRuns.find((run) => run.roomRunId === owner.roomRunId);
  if (!roomRun) throw new Error(`Character Room '${owner.roomRunId}' is unavailable.`);
  const boundedEligibleParticipantIds =
    roomRun.schedulingPolicy.kind === 'bounded-autonomous'
      ? new Set(roomRun.schedulingPolicy.eligibleParticipantIds)
      : undefined;

  return {
    ownerKind: owner.kind,
    participants: roomRun.participants.map((participant) => {
      const schedulingActive =
        boundedEligibleParticipantIds === undefined ||
        boundedEligibleParticipantIds.has(participant.participantId);
      if (participant.controller.kind !== 'agent') {
        const publication =
          participant.characterVersionId === undefined
            ? undefined
            : requirePublication(snapshot, participant.characterVersionId);
        return projectNonAgentParticipant(participant, publication, schedulingActive);
      }

      const run = requireRun(snapshot, participant.controller.characterRunId);
      if (
        run.participantId !== participant.participantId ||
        run.characterVersionId !== participant.characterVersionId ||
        run.controller.kind !== 'agent' ||
        run.controller.primaryAgentSessionId !== participant.controller.primaryAgentSessionId
      ) {
        throw new Error(
          `Room participant '${participant.participantId}' does not match its exact CharacterRun authority.`,
        );
      }
      return projectCharacterParticipant(
        snapshot,
        {
          participantId: participant.participantId,
          displayName: participant.displayName,
          controller: participant.controller,
        },
        run,
        requirePublication(snapshot, run.characterVersionId),
        schedulingActive,
      );
    }),
  };
}

export function CharacterParticipantManagerSurface({
  locale,
  onSelectedParticipantChange,
  owner,
  renderParticipantIdentity,
  selectedParticipantId: controlledSelectedParticipantId,
  snapshot,
}: {
  readonly locale: SupportedLocale;
  readonly onSelectedParticipantChange?: (participantId: string) => void;
  readonly owner: CharacterParticipantManagerOwner;
  readonly renderParticipantIdentity?: (
    participant: CharacterParticipantProjection,
    placement: 'list' | 'details',
  ) => ReactNode;
  readonly selectedParticipantId?: string;
  readonly snapshot: CharacterFoundationSnapshot;
}): JSX.Element {
  const projection = useMemo(
    () => projectCharacterParticipantManager(snapshot, owner),
    [owner, snapshot],
  );
  const room = projection.ownerKind === 'room';
  const [query, setQuery] = useState('');
  const [localSelectedParticipantId, setLocalSelectedParticipantId] = useState(
    projection.participants[0]?.participantId,
  );
  const selectedParticipantId = controlledSelectedParticipantId ?? localSelectedParticipantId;
  const visibleParticipants = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return normalizedQuery.length === 0
      ? projection.participants
      : projection.participants.filter((participant) =>
          participant.displayName.toLocaleLowerCase(locale).includes(normalizedQuery),
        );
  }, [locale, projection.participants, query]);
  const selectedParticipant =
    visibleParticipants.find(
      (participant) => participant.participantId === selectedParticipantId,
    ) ?? visibleParticipants[0];

  useEffect(() => {
    if (selectedParticipant && selectedParticipant.participantId !== selectedParticipantId) {
      setLocalSelectedParticipantId(selectedParticipant.participantId);
      onSelectedParticipantChange?.(selectedParticipant.participantId);
    }
  }, [onSelectedParticipantChange, selectedParticipant, selectedParticipantId]);

  const selectParticipant = (participantId: string): void => {
    setLocalSelectedParticipantId(participantId);
    onSelectedParticipantChange?.(participantId);
  };

  return (
    <section
      className="character-participant-manager"
      data-character-participant-manager="true"
      data-character-participant-owner-kind={projection.ownerKind}
    >
      <header className="character-participant-manager__header">
        {room ? <UsersIcon size={16} /> : <UserIcon size={16} />}
        <strong>
          {room
            ? foundationLabel(locale, '参与者', 'Participants')
            : foundationLabel(locale, '角色', 'Character')}
        </strong>
        {room ? <span>{projection.participants.length}</span> : null}
      </header>

      {room ? (
        <label className="character-participant-manager__search">
          <SearchIcon size={14} aria-hidden="true" />
          <input
            aria-label={foundationLabel(locale, '搜索参与者', 'Search participants')}
            placeholder={foundationLabel(locale, '搜索参与者', 'Search participants')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      ) : null}

      <div className="character-participant-manager__body">
        {room ? (
          <ul
            aria-label={foundationLabel(locale, '会话参与者', 'Conversation participants')}
            className="character-participant-manager__list"
          >
            {visibleParticipants.map((participant) => (
              <li key={participant.participantId}>
                <button
                  aria-pressed={participant.participantId === selectedParticipant?.participantId}
                  className="character-participant-manager__participant"
                  data-character-participant={participant.participantId}
                  data-character-participant-controller={participant.controllerKind}
                  type="button"
                  onClick={() => selectParticipant(participant.participantId)}
                >
                  {renderParticipantIdentity?.(participant, 'list') ?? (
                    <ParticipantAvatar participant={participant} />
                  )}
                  <span className="character-participant-manager__participant-copy">
                    <strong>{participant.displayName}</strong>
                    <small>{participantSummary(locale, participant)}</small>
                  </span>
                  <span
                    className={`character-participant-manager__status is-${participant.schedulingState}`}
                  >
                    {participant.schedulingState === 'active'
                      ? foundationLabel(locale, '活跃', 'Active')
                      : foundationLabel(locale, '暂停', 'Paused')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {visibleParticipants.length === 0 ? (
          <div className="character-participant-manager__empty" role="status">
            {foundationLabel(locale, '没有匹配的参与者', 'No matching participants')}
          </div>
        ) : selectedParticipant ? (
          <ParticipantDetails
            identity={renderParticipantIdentity?.(selectedParticipant, 'details')}
            locale={locale}
            participant={selectedParticipant}
          />
        ) : null}
      </div>
    </section>
  );
}

export function CharacterParticipantIdentityAvatar({
  locale,
  onSelect,
  participant,
  portraitState = participant.character?.portraitRepresentationId ? 'unavailable' : 'unconfigured',
  portraitUrl,
  profile = true,
  size = 'standard',
}: {
  readonly locale: SupportedLocale;
  readonly onSelect?: (participantId: string) => void;
  readonly participant: CharacterParticipantProjection;
  readonly portraitState?: 'loading' | 'ready' | 'unavailable' | 'unconfigured';
  readonly portraitUrl?: string;
  readonly profile?: boolean;
  readonly size?: 'compact' | 'standard';
}): JSX.Element {
  const portrait = (
    <span className="character-participant-identity__portrait" aria-hidden="true">
      {portraitState === 'ready' && portraitUrl ? (
        <img alt="" src={portraitUrl} />
      ) : (
        participant.displayName.slice(0, 1).toLocaleUpperCase(locale)
      )}
    </span>
  );
  return (
    <span
      className={`character-participant-identity is-${size}`}
      data-character-participant-identity={participant.participantId}
    >
      {onSelect ? (
        <button
          className="character-participant-identity__trigger"
          aria-label={foundationLabel(
            locale,
            `选择 ${participant.displayName}`,
            `Select ${participant.displayName}`,
          )}
          type="button"
          onClick={() => onSelect(participant.participantId)}
        >
          {portrait}
        </button>
      ) : (
        <span
          className="character-participant-identity__trigger"
          tabIndex={profile ? 0 : undefined}
        >
          {portrait}
        </span>
      )}
      {profile ? (
        <span className="character-participant-identity__profile" role="tooltip">
          <strong>{participant.displayName}</strong>
          <small>{controllerLabel(locale, participant.controllerKind)}</small>
          <dl>
            {participant.character ? (
              <>
                <DetailRow
                  label={foundationLabel(locale, '角色版本', 'Character version')}
                  value={participant.character.versionLabel}
                />
                {participant.character.mode ? (
                  <DetailRow
                    label={foundationLabel(locale, '对话模式', 'Conversation mode')}
                    value={modeLabel(locale, participant.character.mode)}
                  />
                ) : null}
              </>
            ) : null}
            <DetailRow
              label={foundationLabel(locale, '参与状态', 'Participation')}
              value={
                participant.schedulingState === 'active'
                  ? foundationLabel(locale, '可参与响应', 'Eligible to respond')
                  : foundationLabel(locale, '已暂停响应', 'Responses paused')
              }
            />
            <DetailRow
              label={foundationLabel(locale, '头像', 'Portrait')}
              value={portraitStatusLabel(locale, portraitState)}
            />
          </dl>
        </span>
      ) : null}
    </span>
  );
}

function ParticipantAvatar({
  participant,
}: {
  readonly participant: CharacterParticipantProjection;
}): JSX.Element {
  return (
    <span className="character-participant-manager__avatar" aria-hidden="true">
      {participant.controllerKind === 'agent' ? (
        <BotIcon size={15} />
      ) : participant.controllerKind === 'human' ? (
        <UserIcon size={15} />
      ) : (
        <UsersIcon size={15} />
      )}
    </span>
  );
}

function ParticipantDetails({
  identity,
  locale,
  participant,
}: {
  readonly identity?: ReactNode;
  readonly locale: SupportedLocale;
  readonly participant: CharacterParticipantProjection;
}): JSX.Element {
  const character = participant.character;
  return (
    <section
      aria-label={`${participant.displayName} ${foundationLabel(locale, '详情', 'details')}`}
      className="character-participant-manager__details"
      data-character-participant-details={participant.participantId}
    >
      <header>
        {identity ?? <ParticipantAvatar participant={participant} />}
        <div>
          <strong>{participant.displayName}</strong>
          <span>{controllerLabel(locale, participant.controllerKind)}</span>
        </div>
      </header>

      <dl>
        {character ? (
          <>
            <DetailRow
              label={foundationLabel(locale, '角色版本', 'Character version')}
              value={character.versionLabel}
            />
            {character.mode ? (
              <DetailRow
                label={foundationLabel(locale, '对话模式', 'Conversation mode')}
                value={modeLabel(locale, character.mode)}
              />
            ) : null}
            <DetailRow
              label={foundationLabel(locale, 'Agent 会话', 'Agent session')}
              value={
                character.agentSessionBound
                  ? foundationLabel(locale, '已绑定', 'Bound')
                  : foundationLabel(locale, '不适用', 'Not applicable')
              }
            />
            <DetailRow
              icon={<VolumeIcon size={13} />}
              label={foundationLabel(locale, '语音', 'Voice')}
              value={voiceLabel(locale, character)}
            />
            <DetailRow
              label={foundationLabel(locale, '表现形象', 'Representation')}
              value={representationLabel(locale, character.representationKind)}
            />
            {character.mode === 'narrative' ? (
              <DetailRow
                icon={<StorylineIcon size={13} />}
                label={foundationLabel(locale, '故事情境', 'Story context')}
                value={
                  character.storylineNodeTitle ??
                  foundationLabel(locale, '自由叙事', 'Free narrative')
                }
              />
            ) : null}
          </>
        ) : (
          <DetailRow
            label={foundationLabel(locale, '参与者类型', 'Participant type')}
            value={controllerLabel(locale, participant.controllerKind)}
          />
        )}
        <DetailRow
          label={foundationLabel(locale, '参与状态', 'Participation')}
          value={
            participant.schedulingState === 'active'
              ? foundationLabel(locale, '可参与响应', 'Eligible to respond')
              : foundationLabel(locale, '已暂停响应', 'Responses paused')
          }
        />
      </dl>
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  readonly icon?: JSX.Element;
  readonly label: string;
  readonly value: string;
}): JSX.Element {
  return (
    <div>
      <dt>
        {icon}
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function projectCharacterParticipant(
  snapshot: CharacterFoundationSnapshot,
  participant: {
    readonly participantId: string;
    readonly displayName: string;
    readonly controller: { readonly kind: 'agent' | 'human' };
  },
  run: CharacterRun,
  publication: CharacterPublication,
  schedulingActive: boolean,
): CharacterParticipantProjection {
  const presentation = snapshot.character.presentationConfigurations.find(
    (configuration) => configuration.characterRunId === run.characterRunId,
  );
  const avatarRepresentationId =
    publication.definition.representationDefaults?.avatarRepresentationId;
  const portraitRepresentationId =
    publication.definition.representationDefaults?.portraitRepresentationId;
  const representation = publication.definition.representationRefs.find(
    (candidate) => candidate.representationId === avatarRepresentationId,
  );
  return {
    participantId: participant.participantId,
    displayName: participant.displayName,
    controllerKind: participant.controller.kind,
    schedulingState: schedulingActive ? 'active' : 'paused',
    character: {
      characterRunId: run.characterRunId,
      versionLabel: publication.label,
      mode: run.runtimeBinding.kind,
      agentSessionBound: run.controller.kind === 'agent',
      ...(presentation === undefined
        ? {}
        : {
            tts: {
              autoRead: presentation.tts.autoRead,
              speed: presentation.tts.speed,
            },
          }),
      ...(representation === undefined ? {} : { representationKind: representation.kind }),
      ...(portraitRepresentationId === undefined ? {} : { portraitRepresentationId }),
      ...(run.runtimeBinding.kind === 'narrative' && run.runtimeBinding.storyline
        ? {
            storylineNodeTitle: requireStorylineNodeTitle(
              snapshot,
              run.runtimeBinding.storyline.characterStorylineVersionId,
              run.runtimeBinding.storyline.storylineNodeId,
            ),
          }
        : {}),
    },
  };
}

function projectNonAgentParticipant(
  participant: RoomParticipant,
  publication: CharacterPublication | undefined,
  schedulingActive: boolean,
): CharacterParticipantProjection {
  const avatarRepresentationId =
    publication?.definition.representationDefaults?.avatarRepresentationId;
  const portraitRepresentationId =
    publication?.definition.representationDefaults?.portraitRepresentationId;
  const representation = publication?.definition.representationRefs.find(
    (candidate) => candidate.representationId === avatarRepresentationId,
  );
  return {
    participantId: participant.participantId,
    displayName: participant.displayName,
    controllerKind: participant.controller.kind,
    schedulingState: schedulingActive ? 'active' : 'paused',
    ...(publication === undefined
      ? {}
      : {
          character: {
            versionLabel: publication.label,
            agentSessionBound: false,
            ...(representation === undefined ? {} : { representationKind: representation.kind }),
            ...(portraitRepresentationId === undefined ? {} : { portraitRepresentationId }),
          },
        }),
  };
}

function portraitStatusLabel(
  locale: SupportedLocale,
  state: 'loading' | 'ready' | 'unavailable' | 'unconfigured',
): string {
  switch (state) {
    case 'loading':
      return foundationLabel(locale, '正在载入', 'Loading');
    case 'ready':
      return foundationLabel(locale, '已配置', 'Configured');
    case 'unavailable':
      return foundationLabel(locale, '不可用', 'Unavailable');
    case 'unconfigured':
      return foundationLabel(locale, '未配置', 'Not configured');
  }
}

function requireRun(snapshot: CharacterFoundationSnapshot, characterRunId: string): CharacterRun {
  const run = snapshot.character.characterRuns.find(
    (candidate) => candidate.characterRunId === characterRunId,
  );
  if (!run) throw new Error(`CharacterRun '${characterRunId}' is unavailable.`);
  return run;
}

function requirePublication(
  snapshot: CharacterFoundationSnapshot,
  characterVersionId: string,
): CharacterPublication {
  const publication = snapshot.character.versions.find(
    (candidate) => candidate.characterVersionId === characterVersionId,
  );
  if (!publication) throw new Error(`CharacterVersion '${characterVersionId}' is unavailable.`);
  return publication;
}

function requireStorylineNodeTitle(
  snapshot: CharacterFoundationSnapshot,
  characterStorylineVersionId: string,
  storylineNodeId: string,
): string {
  const publication = snapshot.character.storylineVersions.find(
    (candidate) => candidate.characterStorylineVersionId === characterStorylineVersionId,
  );
  const node = publication?.nodes.find(
    (candidate) => candidate.storylineNodeId === storylineNodeId,
  );
  if (!node) {
    throw new Error(
      `Storyline node '${storylineNodeId}' is unavailable in '${characterStorylineVersionId}'.`,
    );
  }
  return node.title;
}

function participantSummary(
  locale: SupportedLocale,
  participant: CharacterParticipantProjection,
): string {
  const character = participant.character;
  if (!character) return controllerLabel(locale, participant.controllerKind);
  const mode = character.mode ? modeLabel(locale, character.mode) : undefined;
  return [character.versionLabel, mode, controllerLabel(locale, participant.controllerKind)]
    .filter((value): value is string => value !== undefined)
    .join(' · ');
}

function controllerLabel(
  locale: SupportedLocale,
  controller: CharacterParticipantProjection['controllerKind'],
): string {
  switch (controller) {
    case 'agent':
      return foundationLabel(locale, '角色 Agent', 'Character Agent');
    case 'human':
      return foundationLabel(locale, '用户控制', 'User controlled');
    case 'system':
      return foundationLabel(locale, '系统参与者', 'System participant');
  }
}

function modeLabel(locale: SupportedLocale, mode: 'companion' | 'narrative'): string {
  return mode === 'companion'
    ? foundationLabel(locale, '日常', 'Companion')
    : foundationLabel(locale, '叙事', 'Narrative');
}

function voiceLabel(
  locale: SupportedLocale,
  character: NonNullable<CharacterParticipantProjection['character']>,
): string {
  if (!character.tts) return foundationLabel(locale, '未配置', 'Not configured');
  const speed = `${character.tts.speed.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '')}×`;
  return character.tts.autoRead
    ? `${foundationLabel(locale, '自动朗读', 'Auto-read')} · ${speed}`
    : `${foundationLabel(locale, '手动播放', 'Manual playback')} · ${speed}`;
}

function representationLabel(
  locale: SupportedLocale,
  kind: CharacterRepresentationKind | undefined,
): string {
  if (!kind) return foundationLabel(locale, '未配置', 'Not configured');
  const labels: Record<CharacterRepresentationKind, readonly [string, string]> = {
    portrait: ['肖像', 'Portrait'],
    live2d: ['Live2D', 'Live2D'],
    vrm: ['VRM 3D', 'VRM 3D'],
    mmd: ['MMD 3D', 'MMD 3D'],
    pngtuber: ['PNGTuber', 'PNGTuber'],
    voice: ['语音', 'Voice'],
  };
  const label = labels[kind];
  return foundationLabel(locale, label[0], label[1]);
}
