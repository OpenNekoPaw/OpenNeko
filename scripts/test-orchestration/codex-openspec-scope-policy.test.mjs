import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const SKILL_ROOT = '.codex/skills';

describe('Codex OpenSpec scope policy', () => {
  it('keeps proposal routing limited to unlanded product-level capability changes', async () => {
    const [agents, propose] = await Promise.all([
      readFile('AGENTS.md', 'utf8'),
      readSkill('openspec-propose'),
    ]);

    assert.match(
      agents,
      /OpenSpec 只用于系统级或产品级功能变更/u,
      'AGENTS.md must retain the authoritative product-level scope rule',
    );
    assert.match(
      propose.description,
      /unlanded system-level or product-level capability change/u,
      'proposal discovery must name the qualifying capability scope',
    );
    assert.match(
      propose.description,
      /Do not use for local UI details, bugs, performance work, refactors/u,
      'proposal discovery must reject adjacent local work',
    );
    assert.match(
      propose.body,
      /Treat code size, file count, module count, user visibility, or the word "feature" as insufficient/u,
      'proposal execution must not infer product scope from implementation size',
    );
    assert.match(
      propose.body,
      /stop before `openspec new change`/u,
      'a rejected scope must fail before proposal creation',
    );
  });

  it('revalidates active changes without auto-selecting or assuming an archive lifecycle', async () => {
    const apply = await readSkill('openspec-apply-change');

    assert.match(
      apply.description,
      /after repository instructions confirm it is still an unlanded system-level or product-level capability change/u,
      'apply discovery must require an active qualifying change',
    );
    assert.match(
      apply.body,
      /Do not select a change merely because it is the only active change/u,
      'apply must not bind unrelated work to the only active proposal',
    );
    assert.match(
      apply.body,
      /production code already provides the canonical capability path/u,
      'apply must stop after the capability becomes canonical',
    );
    assert.doesNotMatch(
      apply.body,
      /suggest archive|Ready to archive/u,
      'apply must not retain the upstream archive default',
    );
  });

  it('makes archive and exploration subordinate to repository governance', async () => {
    const [archive, explore] = await Promise.all([
      readSkill('openspec-archive-change'),
      readSkill('openspec-explore'),
    ]);

    assert.match(
      archive.description,
      /In OpenNeko, refuse retained proposal archives/u,
      'archive discovery must advertise its repository-policy boundary',
    );
    assert.match(
      archive.body,
      /If proposal archives are prohibited, stop immediately/u,
      'archive execution must fail before mutation when archives are forbidden',
    );
    assert.match(
      explore.description,
      /Exploration does not imply an OpenSpec proposal/u,
      'exploration discovery must not route every idea into OpenSpec',
    );
    assert.match(
      explore.body,
      /ordinary local work proceeds directly in code and tests/u,
      'exploration must preserve the direct implementation path for local work',
    );
  });
});

async function readSkill(name) {
  const source = await readFile(`${SKILL_ROOT}/${name}/SKILL.md`, 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  assert.ok(match, `${name} must have YAML frontmatter`);
  const description = match[1]
    .split('\n')
    .find((line) => line.startsWith('description: '))
    ?.slice('description: '.length);
  assert.ok(description, `${name} must have a description`);
  return { description, body: match[2] };
}
