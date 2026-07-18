/**
 * Golden snapshot tests — captures the final composed system prompt for a fixed
 * set of scenarios. Purpose: detect unintended drift in Stage B (skill module
 * migration) and Stage C (base prompt cleanup).
 *
 * Scenarios cover:
 *  - default EN base, no skill active
 *  - default ZH base, no skill active
 *  - Plan mode EN
 *
 * When expected changes happen (e.g. Stage C strips identity from base), update
 * the snapshots AFTER human review that the diff matches the intended deletion.
 */
import { describe, it, expect } from 'vitest';
import { SystemPromptComposer } from '../system-prompt-composer';
import {
  BUILTIN_DEFAULT_PROMPT_EN,
  BUILTIN_DEFAULT_PROMPT_ZH,
  BUILTIN_PLAN_PROMPT_EN,
} from '../builtin-prompts';
import { SubpackageFragmentsModule } from '../modules/environment/subpackage-fragments-module';

function composeBaseOnly(base: string): string {
  const composer = new SystemPromptComposer();
  composer.setBase(base);
  return composer.compose();
}

describe('prompt golden snapshots', () => {
  it('default EN base (no skill)', () => {
    expect(composeBaseOnly(BUILTIN_DEFAULT_PROMPT_EN)).toMatchSnapshot();
  });

  it('default ZH base (no skill)', () => {
    expect(composeBaseOnly(BUILTIN_DEFAULT_PROMPT_ZH)).toMatchSnapshot();
  });

  it('base prompts keep domain-specific creative artifact contracts out of the default layer', () => {
    for (const prompt of [BUILTIN_DEFAULT_PROMPT_EN, BUILTIN_DEFAULT_PROMPT_ZH]) {
      expect(prompt).toMatch(
        /Markdown Extensions And Generation Prompts|Markdown 扩展与生成提示词/,
      );
      expect(prompt).toMatch(/shared Markdown\/profile|shared Markdown\/profile 层/);
      expect(prompt).toMatch(/@entity|@asset/);
      expect(prompt).toContain('![alt](resource-token#hint)');
      expect(prompt).toMatch(/Generation prompt cells|生成提示词单元格/);
      expect(prompt).toMatch(/Structured Creative Artifacts|结构化创作产物/);
      expect(prompt).toMatch(/requires image-pixel evidence|需要图片像素证据/);
      expect(prompt).toMatch(/native multimodal attachment|原生多模态附件/);
      expect(prompt).toContain('perception.image.understand');
      expect(prompt).toMatch(/do not call `ReadImage` merely because|不要只因为看到了/);
      expect(prompt).toMatch(/stable `ResourceRef`|稳定 `ResourceRef`/);
      expect(prompt).toMatch(/independent from `ReadDocument`|与 `ReadDocument` 是独立工具/);
      expect(prompt).toMatch(/missing visual-analysis path|视觉分析链路缺失/);
      expect(prompt).toMatch(/artifact profile|当前 artifact profile/);
      expect(prompt).toMatch(
        /named, reviewable Markdown artifact|具名、可审阅的 Markdown artifact/,
      );
      expect(prompt).toMatch(/NEKO fenced JSON composite artifact/);
      expect(prompt).toMatch(/runtime capability contract/);
      expect(prompt).toMatch(/validation requirements/);
      expect(prompt).toMatch(
        /newly created assets, report completion only after|新资产生成时，只有相应工具或 runtime capability 返回成功后/,
      );
      expect(prompt).toMatch(
        /do not claim generated, written, exported, sent, or completed output|不得把预期内容描述成已完成结果/,
      );
      expect(prompt).toMatch(/do not stop after presenting a plan|不得在给出计划后停止/);
      expect(prompt).toMatch(
        /actual files, generated assets, project revisions, or Quality evidence|实际文件、生成资产、项目 revision 或 Quality 证据/,
      );
      expect(prompt).toMatch(/domain node JSON|领域节点 JSON/);
      expect(prompt).toContain('Webview URI');
      expect(prompt).toContain('blob URL');
      expect(prompt).toContain('Engine token');
      expect(prompt).not.toContain('Markdown Storyboard Drafts');
      expect(prompt).not.toContain('Markdown 分镜草稿');
      expect(prompt).not.toContain('canvas.ingestMarkdown');
      expect(prompt).not.toContain('intentHint: "creative-table"');
      expect(prompt).not.toContain('profileHint: "storyboard"');
      expect(prompt).not.toContain('canvas.createStoryboardFromMarkdown');
      expect(prompt).not.toContain('old plugin-transfer payload');
      expect(prompt).not.toContain('Canvas node JSON');
      expect(prompt).not.toContain('StoryboardTable');
      expect(prompt).not.toContain('storyboard draft runtime');
      expect(prompt).not.toContain('compile through the local storyboard draft runtime');
      expect(prompt).not.toContain('本地 storyboard draft runtime');
    }
  });

  it('plan mode EN base', () => {
    expect(composeBaseOnly(BUILTIN_PLAN_PROMPT_EN)).toMatchSnapshot();
  });

  // PR3e: sub-package PromptFragments from AgentCapabilityProvider.
  // Documents composed output when two hypothetical providers (neko-cut +
  // neko-canvas) each contribute one fragment at priority 70. Section ids
  // follow the `fragment:{package}:{local}` convention.
  it('EN base + subpackage prompt fragments (environment layer)', () => {
    const composer = new SystemPromptComposer();
    composer.setBase(BUILTIN_DEFAULT_PROMPT_EN);

    const mod = new SubpackageFragmentsModule();
    mod.setFragments([
      {
        id: 'neko-cut:timeline-basics',
        content: '## Timeline editing\n\n- Timestamps in ms.\n- Add tracks before elements.',
      },
      {
        id: 'neko-canvas:shot-composition',
        content: '## Canvas composition\n\n- Three-point grid preferred.',
      },
    ]);
    const sections = mod.renderSync() ?? [];
    for (const s of sections) {
      composer.setSection({
        id: s.sectionId,
        layer: s.layer,
        content: s.content,
        priority: s.priority ?? 70,
      });
    }
    expect(composer.compose()).toMatchSnapshot();
  });

  // PR3b: AGENTS.md overlays into the environment layer instead of
  // replacing the base. This snapshot documents the composed output when a
  // user-authored project-level AGENTS.md is present.
  it('EN base + AGENTS.md overlay (environment layer)', () => {
    const composer = new SystemPromptComposer();
    composer.setBase(BUILTIN_DEFAULT_PROMPT_EN);
    composer.setSection({
      id: 'agents-md:override',
      layer: 'environment',
      content: '# Project Overrides\n\nUse TypeScript strict mode.\nPrefer functional composition.',
      priority: 80,
    });
    expect(composer.compose()).toMatchSnapshot();
  });
});
