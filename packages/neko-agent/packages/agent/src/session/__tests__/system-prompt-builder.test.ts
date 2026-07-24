/**
 * Session Module Tests
 */

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

    it('should require agent-driven skill activation to follow content understanding', () => {
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('Do not activate skills by keyword matching');
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('Use ordinary Agent capabilities first');
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('state the activation reason');
      expect(BUILTIN_DEFAULT_PROMPT_EN).toContain(
        'When a request mixes analysis and creative production',
      );
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('不要通过关键词匹配激活技能');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('先使用普通 Agent 能力');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('说明激活原因');
      expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('当请求同时包含分析和创作产物');
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

  it('should contain key instructions in default prompts', () => {
    // English
    expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('ActivateSkill');
    expect(BUILTIN_DEFAULT_PROMPT_EN).toContain('GetContext');

    // Chinese
    expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('ActivateSkill');
    expect(BUILTIN_DEFAULT_PROMPT_ZH).toContain('GetContext');
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
