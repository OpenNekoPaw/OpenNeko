import { useMemo, useState } from 'react';
import type { NpcProfileFact } from '@neko/chara/contracts';
import type { CharacterDialogueSessionProjection } from '@neko/agent-contracts';
import { useAgentHostMessages } from '../../host-runtime-context';
import { useTranslation } from '../../i18n/I18nContext';
import { projectCharacterFactLabel } from '../../presenters/character-role-session-presenter';

interface CharacterDialogueHeaderProps {
  session: CharacterDialogueSessionProjection;
}

export function CharacterDialogueHeader({ session }: CharacterDialogueHeaderProps) {
  const agentHostMessages = useAgentHostMessages();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const profileRegionId = `character-dialogue-profile-${session.sessionId}`;
  const confirmedFacts = useMemo(
    () => session.profile.facts.filter((fact) => fact.authority === 'confirmed').slice(0, 8),
    [session.profile.facts],
  );
  const suggestedFacts = useMemo(
    () => session.profile.facts.filter((fact) => fact.authority === 'suggested').slice(0, 8),
    [session.profile.facts],
  );

  return (
    <div className="border-b border-[var(--neko-panel-border)] bg-[var(--neko-sideBar-background)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--neko-foreground)]">
              {session.displayName}
            </span>
            <span className="rounded-sm border border-[var(--neko-panel-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-normal text-[var(--neko-descriptionForeground)]">
              {t(`characterRole.dialogue.mode.${session.mode}`)}
            </span>
            <span className="rounded-sm border border-[var(--neko-panel-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-normal text-[var(--neko-descriptionForeground)]">
              {t(`characterRole.dialogue.sparsity.${session.profile.sparsity}`)}
            </span>
          </div>
          {session.summary ? (
            <div className="mt-0.5 truncate text-[11px] text-[var(--neko-descriptionForeground)]">
              {session.summary}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={profileRegionId}
          className="rounded px-2 py-1 text-[11px] text-[var(--neko-foreground)] hover:bg-[var(--neko-toolbar-hoverBackground)]"
        >
          {t('characterRole.action.profile')}
        </button>
        <button
          type="button"
          onClick={() => agentHostMessages.exitCharacterDialogueSession(session.sessionId)}
          className="rounded px-2 py-1 text-[11px] text-[var(--neko-foreground)] hover:bg-[var(--neko-toolbar-hoverBackground)]"
        >
          {t('characterRole.action.exit')}
        </button>
      </div>

      {expanded && (
        <div
          id={profileRegionId}
          role="region"
          aria-label={t('characterRole.action.profile')}
          className="grid max-h-[45vh] gap-3 overflow-y-auto overscroll-contain border-t border-[var(--neko-panel-border)] px-3 py-2 text-[11px] md:grid-cols-2"
        >
          <CharacterFactList
            title={t('characterRole.dialogue.confirmed')}
            facts={confirmedFacts}
            translate={t}
          />
          <CharacterFactList
            title={t('characterRole.dialogue.suggested')}
            facts={suggestedFacts}
            translate={t}
          />
          {session.profile.dialogueSamples?.length ? (
            <div className="md:col-span-2">
              <div className="mb-1 text-[var(--neko-descriptionForeground)]">
                {t('characterRole.dialogue.samples')}
              </div>
              <div className="space-y-1">
                {session.profile.dialogueSamples.slice(0, 3).map((sample, index) => (
                  <div
                    key={`${index}-${sample}`}
                    className="rounded border border-[var(--neko-panel-border)] px-2 py-1 text-[var(--neko-foreground)]"
                  >
                    {sample}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CharacterFactList({
  title,
  facts,
  translate,
}: {
  title: string;
  facts: readonly NpcProfileFact[];
  translate: Translate;
}) {
  return (
    <div>
      <div className="mb-1 text-[var(--neko-descriptionForeground)]">{title}</div>
      {facts.length > 0 ? (
        <div className="space-y-1">
          {facts.map((fact) => (
            <div
              key={`${fact.key}-${String(fact.value)}-${fact.source}`}
              className="rounded border border-[var(--neko-panel-border)] px-2 py-1"
            >
              <div className="text-[var(--neko-descriptionForeground)]">
                {projectCharacterFactLabel(fact.key, translate)}
              </div>
              <div className="truncate text-[var(--neko-foreground)]">
                {formatFactValue(fact.value)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[var(--neko-descriptionForeground)]">
          {translate('characterRole.none')}
        </div>
      )}
    </div>
  );
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function formatFactValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}
