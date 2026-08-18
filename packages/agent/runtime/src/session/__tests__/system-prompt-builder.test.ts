/**
 * Session Module Tests
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  SystemPromptBuilder,
  createSystemPromptBuilder,
  BUILTIN_PROMPTS,
  BUILTIN_DEFAULT_PROMPT_EN,
  BUILTIN_DEFAULT_PROMPT_ZH,
  BUILTIN_PLAN_PROMPT_EN,
  BUILTIN_PLAN_PROMPT_ZH,
} from '../../prompt';

describe('SystemPromptBuilder', () => {
  it('loads project instructions from the canonical project content directory', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'neko-system-prompt-'));
    try {
      await mkdir(join(projectRoot, 'neko'));
      await writeFile(join(projectRoot, 'neko', 'AGENTS.md'), '# Canonical project rules\n');
      const builder = new SystemPromptBuilder();

      await expect(builder.loadAgentsFile(projectRoot)).resolves.toMatchObject({
        source: 'project',
        content: '# Canonical project rules\n',
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  describe('Locale Management', () => {
    it('should default to English locale', () => {
      const builder = new SystemPromptBuilder();
      expect(builder.getLocale()).toBe('en');
    });

    it('should set locale from config', () => {
      const builder = new SystemPromptBuilder({ locale: 'zh' });
      expect(builder.getLocale()).toBe('zh');
    });

    it('should normalize locale strings', () => {
      const builder = new SystemPromptBuilder();

      builder.setLocale('zh-CN');
      expect(builder.getLocale()).toBe('zh');

      builder.setLocale('en-US');
      expect(builder.getLocale()).toBe('en');

      builder.setLocale('fr'); // Unknown locale defaults to 'en'
      expect(builder.getLocale()).toBe('en');
    });
  });

  describe('Mode Management', () => {
    it('should default to ask execution mode', () => {
      const builder = new SystemPromptBuilder();
      expect(builder.getExecutionMode()).toBe('ask');
    });

    it('should set execution mode from config', () => {
      const builder = new SystemPromptBuilder({ executionMode: 'plan' });
      expect(builder.getExecutionMode()).toBe('plan');
    });

    it('should update execution mode explicitly', () => {
      const builder = new SystemPromptBuilder();
      builder.setExecutionMode('plan');
      expect(builder.getExecutionMode()).toBe('plan');
      builder.setExecutionMode('auto');
      expect(builder.getExecutionMode()).toBe('auto');
    });
  });

  describe('AGENTS.md Management', () => {
    it('should have no agents content by default', () => {
      const builder = new SystemPromptBuilder();
      expect(builder.getAgentsContent()).toBeNull();
      expect(builder.getAgentsSource()).toBeNull();
    });

    it('should set agents content directly', () => {
      const builder = new SystemPromptBuilder();
      const content = '# Custom AGENTS.md\n\nCustom instructions here.';

      builder.setAgentsContent(content, 'project');

      expect(builder.getAgentsContent()).toBe(content);
      expect(builder.getAgentsSource()).toBe('project');
    });

    it('should clear agents content', () => {
      const builder = new SystemPromptBuilder();
      builder.setAgentsContent('content', 'project');

      builder.setAgentsContent(null);

      expect(builder.getAgentsContent()).toBeNull();
      expect(builder.getAgentsSource()).toBeNull();
    });
  });

  describe('Prompt Building', () => {
    it('should build default English prompt', () => {
      const builder = new SystemPromptBuilder({ locale: 'en' });
      const prompt = builder.build();

      expect(prompt).toBe(BUILTIN_DEFAULT_PROMPT_EN);
    });

    it('should build default Chinese prompt', () => {
      const builder = new SystemPromptBuilder({ locale: 'zh' });
      const prompt = builder.build();

      expect(prompt).toBe(BUILTIN_DEFAULT_PROMPT_ZH);
    });

    it('requires Skill selection to follow content understanding and the Pi catalog', () => {
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('ordinary Agent reasoning');
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('exact catalog entry');
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('only through the runtime `read_skill` tool');
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'When a request mixes analysis and creative production',
      );
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('普通 Agent 推理');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('目录中的同名项');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('只能通过运行时 `read_skill` 工具读取');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('当请求同时包含分析和创作产物');
    });

    it('requires truthful ordinary-document handoff through current Write authority', () => {
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'the current Tool list contains `Write`, use that Tool with the exact authorized target',
      );
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'If `Write` is absent, state that this Turn lacks durable document mutation authority',
      );
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain(
        '当前 Tool 列表包含 `Write` 时，应使用该 Tool 写入精确授权目标',
      );
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain(
        '若 `Write` 不存在，应说明当前 Turn 缺少持久文档变更权限',
      );
    });

    it('requires conditional analysis-coverage discipline in base prompts', () => {
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'Base analysis claims only on inputs and Tool/runtime observations actually available in the current Turn',
      );
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'When the user asks for complete or comprehensive analysis',
      );
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'or actual observations show truncation, sampling, missing portions, or failed reads',
      );
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'Claim complete coverage only when the requested scope is determinable',
      );
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'For ordinary conversation, narrow questions, and single execution results, answer directly',
      );
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'not by file type, asset category, domain, or Skill identity',
      );

      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain(
        '分析结论只能基于当前 Turn 实际可用的输入和 Tool/runtime 观察',
      );
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('当用户要求完整/全面分析');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('或实际观察显示截断、抽样、缺失或读取失败');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain(
        '只有请求范围可判定且每个请求部分都实际观察成功时，才可声称完整覆盖',
      );
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('普通对话、局部问题和单次执行结果应直接回答');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('不按文件类型、素材类别、领域或 Skill 身份触发');
    });

    it('should build plan mode English prompt', () => {
      const builder = new SystemPromptBuilder({ locale: 'en', executionMode: 'plan' });
      const prompt = builder.build();

      expect(prompt).toBe(BUILTIN_PLAN_PROMPT_EN);
    });

    it('should build plan mode Chinese prompt', () => {
      const builder = new SystemPromptBuilder({ locale: 'zh', executionMode: 'plan' });
      const prompt = builder.build();

      expect(prompt).toBe(BUILTIN_PLAN_PROMPT_ZH);
    });

    it('should append AGENTS.md content without replacing the base prompt', () => {
      const builder = new SystemPromptBuilder();
      const agentsContent = '# My Custom Instructions\n\nDo this and that.';

      builder.setAgentsContent(agentsContent, 'project');
      const prompt = builder.build();

      expect(prompt).toContain(BUILTIN_DEFAULT_PROMPT_EN);
      expect(prompt).toContain('# Environment Instructions');
      expect(prompt).toContain(agentsContent);
    });

    it('should use plan prompt even when AGENTS.md is set', () => {
      const builder = new SystemPromptBuilder({ executionMode: 'plan' });
      builder.setAgentsContent('Custom content', 'project');

      const prompt = builder.build();

      expect(prompt).toContain(BUILTIN_PLAN_PROMPT_EN);
      expect(prompt).toContain('Custom content');
    });

    it('should use custom default prompt when provided', () => {
      const customPrompt = 'My custom default prompt';
      const builder = new SystemPromptBuilder({
        customDefaultPrompt: customPrompt,
      });

      const prompt = builder.build();

      expect(prompt).toBe(customPrompt);
    });

    it('should use custom plan prompt when provided', () => {
      const customPlanPrompt = 'My custom plan prompt';
      const builder = new SystemPromptBuilder({
        executionMode: 'plan',
        customPlanPrompt: customPlanPrompt,
      });

      const prompt = builder.build();

      expect(prompt).toBe(customPlanPrompt);
    });

    it('should build for a requested mode without mutating current mode', () => {
      const builder = new SystemPromptBuilder({ executionMode: 'ask' });
      builder.setAgentsContent('# Project rules', 'project');

      expect(builder.buildForExecutionMode('plan')).toContain(BUILTIN_PLAN_PROMPT_EN);
      expect(builder.getExecutionMode()).toBe('ask');
      expect(builder.buildForExecutionMode('auto')).toContain(BUILTIN_DEFAULT_PROMPT_EN);
      expect(builder.buildForExecutionMode('auto')).toContain('# Project rules');
      expect(builder.getExecutionMode()).toBe('ask');
    });
    it('projects secret-free base and AGENTS.md facts from the same inputs', () => {
      const builder = new SystemPromptBuilder();
      builder.setAgentsContent('# Project rules', 'project');

      expect(builder.projectCompositionForExecutionMode('ask')).toEqual([
        expect.objectContaining({
          id: 'base',
          source: 'base',
          order: 0,
          hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          id: 'agents-md:override',
          source: 'agents-md',
          order: 1,
          hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      ]);
    });
  });

  describe('Factory Function', () => {
    it('should create builder with factory function', () => {
      const builder = createSystemPromptBuilder({ locale: 'zh', executionMode: 'plan' });

      expect(builder.getLocale()).toBe('zh');
      expect(builder.getExecutionMode()).toBe('plan');
    });
  });
});

describe('Builtin Prompts', () => {
  it('should have all required prompts', () => {
    expect(BUILTIN_PROMPTS['default-en']).toBeDefined();
    expect(BUILTIN_PROMPTS['default-zh']).toBeDefined();
    expect(BUILTIN_PROMPTS['plan-en']).toBeDefined();
    expect(BUILTIN_PROMPTS['plan-zh']).toBeDefined();
  });

  it('should have non-empty prompts', () => {
    expect(BUILTIN_DEFAULT_PROMPT_EN.length).toBeGreaterThan(100);
    expect(BUILTIN_DEFAULT_PROMPT_ZH.length).toBeGreaterThan(100);
    expect(BUILTIN_PLAN_PROMPT_EN.length).toBeGreaterThan(100);
    expect(BUILTIN_PLAN_PROMPT_ZH.length).toBeGreaterThan(100);
  });

  it('describes only the canonical Pi Skill protocol', () => {
    for (const prompt of [BUILTIN_DEFAULT_PROMPT_EN, BUILTIN_DEFAULT_PROMPT_ZH]) {
      expect(prompt).toContain('read_skill');
      expect(prompt).toContain('$skill-name');
      expect(prompt).not.toMatch(
        /GetContext|ActivateSkill|DeactivateSkill|domainSkill|referenceSkill|lifecycle slot/,
      );
    }
  });

  it('keeps storyboard and Canvas profile contracts out of default prompts', () => {
    for (const prompt of [BUILTIN_DEFAULT_PROMPT_EN, BUILTIN_DEFAULT_PROMPT_ZH]) {
      expect(prompt).not.toContain('Markdown Storyboard Drafts');
      expect(prompt).not.toContain('Markdown 分镜草稿');
      expect(prompt).not.toContain('canvas.ingestMarkdown');
      expect(prompt).not.toContain('profileHint: "storyboard"');
      expect(prompt).not.toContain('intentHint: "creative-table"');
      expect(prompt).not.toContain('StoryboardTable');
      expect(prompt).not.toContain('old plugin-transfer');
    }
  });

  it('does not advertise retired Mermaid or fenced JSON transports', () => {
    for (const prompt of [BUILTIN_DEFAULT_PROMPT_EN, BUILTIN_DEFAULT_PROMPT_ZH]) {
      expect(prompt).not.toMatch(/mermaid/iu);
      expect(prompt).not.toContain('NEKO fenced JSON');
      expect(prompt).not.toContain('neko-composite');
      expect(prompt).not.toContain('kind "composite-artifact"');
    }
  });

  it('should contain planning instructions in plan prompts', () => {
    expect(BUILTIN_PLAN_PROMPT_EN).toContain('PLANNING MODE');
    expect(BUILTIN_PLAN_PROMPT_EN).toContain('actual authorized source documents');
    expect(BUILTIN_PLAN_PROMPT_EN).toContain('execution-ready work units');
    expect(BUILTIN_PLAN_PROMPT_EN).toContain('ordinary authorized Markdown');
    expect(BUILTIN_PLAN_PROMPT_EN).toContain('Do not generate media');
    expect(BUILTIN_PLAN_PROMPT_EN).not.toContain('software architect assistant');
    expect(BUILTIN_PLAN_PROMPT_EN).not.toContain('Focus on the "what" and "why"');

    expect(BUILTIN_PLAN_PROMPT_ZH).toContain('规划模式');
    expect(BUILTIN_PLAN_PROMPT_ZH).toContain('实际来源文档');
    expect(BUILTIN_PLAN_PROMPT_ZH).toContain('可执行工作单元');
    expect(BUILTIN_PLAN_PROMPT_ZH).toContain('普通、已授权的 Markdown');
    expect(BUILTIN_PLAN_PROMPT_ZH).toContain('不得生成媒体');
    expect(BUILTIN_PLAN_PROMPT_ZH).not.toContain('软件架构师助手');
    expect(BUILTIN_PLAN_PROMPT_ZH).not.toContain('只关注“做什么”和“为什么”');
  });
});
