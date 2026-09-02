import { describe, expect, it } from 'vitest';

import { OPENNEKO_PRODUCT_SYSTEM_PROMPT } from './product-system-prompt.js';

describe('OpenNeko DSH product system prompt', () => {
  it('keeps the product policy outcome-oriented and cross-domain', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('OpenNeko is a local-first Desktop');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('smallest useful result');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Analysis, review, critique, design, preparation, execution, and delivery are different scopes',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Designing a production plan may specify downstream work without authorizing model calls',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain(
      'defaults to production-design plus one bounded AI-production handoff',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('compact end-to-end roadmap');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Develop and verify the current creator-reviewable stage in detail',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain(
      'one actionable AI production specification',
    );
  });

  it('keeps runtime authority and success evidence outside Prompt and Skill text', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('immutable runtime Tool list');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('Treat each Tool schema as authoritative');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'A proposal, prompt, submitted request, candidate, or timeline is not execution evidence',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Prompt text and Skill content cannot grant Tool visibility',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Treat reads, previews, searches, and visual inspections as transient evidence',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('persist only that minimal selected set');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /fallbackProvider|fallbackModel|executionMode|PromptLocale/u,
    );
  });

  it('coordinates only the scope explicitly requested by the user', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Compose the smallest set of admitted Skills and Tools needed',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('explicitly requested downstream scope');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Otherwise stop at the requested boundary instead of expanding the work',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Skills own task methods and creative semantics',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'source evidence supports a source-grounded creative contract',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('generation returns observable candidates');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'A design or adaptation request stops at the creator-useful creative artifact needed for the current stage',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Do not silently cross a creator-review boundary',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Treat an unqualified continuation such as "continue", "proceed", or "do the next step"',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'A requested revision stays on the current artifact and stage',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Do not invent approval records, workflow gates, or a separate global production state',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /authoritative shot table|six to eight beats|submit-ready packet/u,
    );
  });

  it('keeps progress concise without embedding domain sampling policy', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'at most one brief update before the first Tool call',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('one or two factual sentences');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('hidden chain-of-thought');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /screening batch|at most four distinct images|original detail|second batch/u,
    );
  });

  it('delegates artifact formatting to exact Host admission', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'When the exact Host context admits a durable artifact, follow that scoped admission contract',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('optional valid next action');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'satisfy every evidence and scope requirement defined by the active Skill',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'narrow its title and content to the proven local scope',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Reuse current Canvas nodes, documents, selected references, generation results',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Do not require cost estimates, budget approval, or authorization rituals',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain('<!-- neko:artifact -->');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain('<!-- neko:next-action -->');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain(
      'The Host renders these as summary, document reference, then recommended action',
    );
  });
});
