import type {
  CharacterFoundationCommand,
  CharacterFoundationSnapshot,
  CharacterRun,
} from '@neko/chara-domain/contracts';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useState } from 'react';
import { createDomainIdentity } from './foundation-ui';
import { foundationLabel } from './labels';

export function CharacterCompanionContinuitySurface({
  execute,
  locale,
  runs,
  snapshot,
}: {
  readonly execute: (command: CharacterFoundationCommand) => Promise<CharacterFoundationSnapshot>;
  readonly locale: SupportedLocale;
  readonly runs: readonly CharacterRun[];
  readonly snapshot: CharacterFoundationSnapshot;
}): JSX.Element {
  const [diagnostic, setDiagnostic] = useState<string>();
  const executeCommand = (command: CharacterFoundationCommand): void => {
    setDiagnostic(undefined);
    void execute(command).catch((error: unknown) => {
      setDiagnostic(error instanceof Error ? error.message : String(error));
    });
  };
  return (
    <section className="character-companion-continuity" data-character-continuity="true">
      <header>
        <strong>{foundationLabel(locale, '对话上下文', 'Conversation context')}</strong>
      </header>
      {runs.map((run) => {
        if (run.runtimeBinding.kind === 'narrative') {
          return (
            <article data-character-continuity-kind="narrative" key={run.characterRunId}>
              <strong>{foundationLabel(locale, '叙事上下文', 'Narrative context')}</strong>
              <span>
                {foundationLabel(
                  locale,
                  '仅保留在当前会话，并受所选故事节点约束。',
                  'Session-only and constrained by the selected storyline node.',
                )}
              </span>
            </article>
          );
        }
        const companionBinding = run.runtimeBinding;
        const continuity = snapshot.character.companionContinuities.find(
          (candidate) => candidate.companionContinuityId === companionBinding.companionContinuityId,
        );
        if (!continuity) {
          return (
            <article data-character-continuity-kind="companion" key={run.characterRunId}>
              <span role="status">
                {foundationLabel(locale, '长期记忆尚不可用', 'Long-term memory is unavailable')}
              </span>
            </article>
          );
        }
        const activeEntries = continuity.entries.filter((entry) => entry.status === 'active');
        const pendingCandidates = continuity.candidates.filter(
          (candidate) => candidate.status === 'pending',
        );
        return (
          <article
            data-character-continuity-id={continuity.companionContinuityId}
            data-character-continuity-kind="companion"
            key={run.characterRunId}
          >
            <div className="character-companion-continuity__heading">
              <strong>{foundationLabel(locale, '长期记忆', 'Long-term memory')}</strong>
              <span>
                {foundationLabel(locale, '修订', 'Revision')} {continuity.continuityRevision}
              </span>
            </div>
            {activeEntries.map((entry) => (
              <div
                className="character-companion-continuity__item"
                data-companion-memory-entry={entry.companionMemoryEntryId}
                key={entry.companionMemoryEntryId}
              >
                <span>{entry.content}</span>
                <button
                  type="button"
                  onClick={() =>
                    executeCommand({
                      operation: 'companion-memory-entry-delete',
                      input: {
                        companionContinuityId: continuity.companionContinuityId,
                        companionMemoryEntryId: entry.companionMemoryEntryId,
                        expectedContinuityRevision: continuity.continuityRevision,
                      },
                    })
                  }
                >
                  {foundationLabel(locale, '删除', 'Delete')}
                </button>
              </div>
            ))}
            {pendingCandidates.map((candidate) => (
              <div
                className="character-companion-continuity__item character-companion-continuity__item--candidate"
                data-companion-memory-candidate={candidate.companionMemoryCandidateId}
                key={candidate.companionMemoryCandidateId}
              >
                <span>{candidate.content}</span>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      executeCommand({
                        operation: 'companion-memory-candidate-accept',
                        input: {
                          companionContinuityId: continuity.companionContinuityId,
                          companionMemoryCandidateId: candidate.companionMemoryCandidateId,
                          companionMemoryEntryId: createDomainIdentity('companion-memory-entry'),
                          expectedContinuityRevision: continuity.continuityRevision,
                        },
                      })
                    }
                  >
                    {foundationLabel(locale, '接受', 'Accept')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      executeCommand({
                        operation: 'companion-memory-candidate-reject',
                        input: {
                          companionContinuityId: continuity.companionContinuityId,
                          companionMemoryCandidateId: candidate.companionMemoryCandidateId,
                          expectedContinuityRevision: continuity.continuityRevision,
                        },
                      })
                    }
                  >
                    {foundationLabel(locale, '拒绝', 'Reject')}
                  </button>
                </div>
              </div>
            ))}
            {activeEntries.length === 0 && pendingCandidates.length === 0 ? (
              <span>{foundationLabel(locale, '暂无记忆', 'No memories yet')}</span>
            ) : null}
          </article>
        );
      })}
      {diagnostic ? <span role="alert">{diagnostic}</span> : null}
    </section>
  );
}
