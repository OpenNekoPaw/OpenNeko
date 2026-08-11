import type { CharacterFoundationSnapshot } from '@neko/chara/contracts';
import type { SupportedLocale } from '@neko/ui/i18n';

export function CharacterStorylineTimelineSurface({
  characterRunIds,
  locale,
  snapshot,
}: {
  readonly characterRunIds: readonly string[];
  readonly locale: SupportedLocale;
  readonly snapshot: CharacterFoundationSnapshot;
}): JSX.Element | null {
  const selected = new Set(characterRunIds);
  const timelines = snapshot.character.characterRuns.flatMap((run) => {
    if (!selected.has(run.characterRunId) || run.runtimeBinding.kind !== 'narrative') return [];
    const binding = run.runtimeBinding.storyline;
    if (!binding) return [];
    const version = snapshot.character.storylineVersions.find(
      (candidate) => candidate.characterStorylineVersionId === binding.characterStorylineVersionId,
    );
    return [{ run, binding, version }];
  });
  if (timelines.length === 0) return null;

  return (
    <section className="character-storyline-timeline" data-storyline-timeline="true">
      <header>
        <strong>{locale.startsWith('zh') ? '故事线时间轴' : 'Storyline timeline'}</strong>
        <span>{locale.startsWith('zh') ? '只读创作背景' : 'Read-only authored context'}</span>
      </header>
      {timelines.map(({ run, binding, version }) => (
        <article
          key={run.characterRunId}
          data-storyline-owner={binding.characterStorylineId}
          data-storyline-version={binding.characterStorylineVersionId}
        >
          <code>{run.characterVersionId}</code>
          <strong>{version?.label ?? binding.characterStorylineVersionId}</strong>
          {version ? (
            <ol>
              {version.nodeOrder.map((storylineNodeId) => {
                const node = version.nodes.find(
                  (candidate) => candidate.storylineNodeId === storylineNodeId,
                );
                return (
                  <li
                    key={storylineNodeId}
                    aria-current={storylineNodeId === binding.storylineNodeId ? 'step' : undefined}
                    data-selected-node={String(storylineNodeId === binding.storylineNodeId)}
                  >
                    <span>{node?.title ?? storylineNodeId}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <span role="status">
              {locale.startsWith('zh')
                ? '所选故事线版本不可用。'
                : 'The selected Storyline publication is unavailable.'}
            </span>
          )}
        </article>
      ))}
    </section>
  );
}
