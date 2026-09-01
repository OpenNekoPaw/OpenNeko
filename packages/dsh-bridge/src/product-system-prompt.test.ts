import { describe, expect, it } from 'vitest';

import { OPENNEKO_PRODUCT_SYSTEM_PROMPT } from './product-system-prompt.js';

describe('OpenNeko DSH product system prompt', () => {
  it('owns the effective product protocol without recreating runtime mode or provider routing', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('OpenNeko is a local-first Desktop');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('immutable runtime tool list');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('A plan is not execution evidence');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/\bPi\b|fallbackProvider|fallbackModel/u);
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('package-owned media Tool');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/executionMode|PromptLocale/u);
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('<!-- neko:artifact -->');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('Keep terminal output as Markdown');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/CompositeArtifact|composite artifact/u);
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/fenced JSON/u);
  });

  it('keeps planning subordinate to admitted execution without owning domain workflows', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('smallest useful result');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Expand when the user explicitly asks for detail',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Planning is coordination state, not the requested deliverable',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'one provisional non-executing handoff form one creative turn',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('do not by themselves justify a task plan');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'bind it to current evidence, an admitted capability, an observable result',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain('action, output, and completion check');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Use operation and parameter names only when the current Tool schema exposes them',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain('active artifact profile');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /primary Skill|single Skill|fixed Skill|risk matrix is required|always include/u,
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /creative proposal fields|analysis report fields|project proposal fields/u,
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('which successful evidence replaced it');
  });

  it('requests concise evidence-based progress without exposing chain-of-thought', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('before the first Tool call');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'objective, approach, or blocking condition materially changes',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('one or two factual sentences');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('Do not narrate every Tool call');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('hidden chain-of-thought');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'never proves that a Tool action, side effect, or artifact succeeded',
    );
  });

  it('owns cross-Skill creative orchestration without defining a fixed domain workflow', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('Creative capability orchestration');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'compose the smallest dependency chain from the current Skill and Tool catalogs',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Classify the requested stopping point before composing work',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'An AI-production-handoff request ends only at a dependency-ready packet',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'An execution request ends only at an observed and validated result',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('In a Workspace or Canvas creative context');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('defaults to AI-production-handoff');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Treat the request as creative-design-only when the user explicitly limits it',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Design or adaptation wording alone never authorizes generation',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'discover and load the next applicable Skill from the current catalog and continue',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Do not stop merely because the active Skill completed its own artifact',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'System reasoning owns cross-Skill sequencing',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Each downstream operation must consume an observed, accepted upstream result',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Use capability roles as internal handoff contracts, not as headings that must appear in the answer',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'only user-specified or creator-confirmed decisions become accepted and executable',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'one reversible, explicitly provisional review packet',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'generation returns observable candidates and generation records, not accepted assets',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'delivery consumes only an accepted master and explicit delivery specification',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Keep proposed, prepared, generated, observed, accepted, and delivered states distinct',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'route the smallest observable correction to the capability that owns the defect',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'do not print the whole capability chain unless the user asks for it',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('never impose a fixed universal pipeline');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /always run analysis|always run preparation|fixed five-stage/u,
    );
  });

  it('separates collaboration from durable document content without owning its domain shape', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Keep collaboration separate from the durable document',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'completion status, decisive rationale, blockers, and open creator choices',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'requested reusable content, necessary evidence or source bindings, and applicable handoff data',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'exclude source-reading narration, Tool logs, progress, internal checks, and rejected reasoning',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'analysis, research, audit, or process record',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /PV structure|shot list|story beat fields|model-call packet/u,
    );
  });

  it('keeps visual inspection bounded and decision-driven', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'name the decision that the next visual evidence must support',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Inspect at most four selected images in one model reasoning batch',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'inspect selected images as low-resolution overviews first',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Read original detail only for the smaller set chosen to confirm',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'form and retain one concise evidence-to-decision conclusion',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Do not reread an image or another image serving the same evidence role',
    );
  });
});
