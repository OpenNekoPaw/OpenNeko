import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from './testing';
import { presentSkillCommand, presentSkillMenu } from './skill-presentation';

describe('skill presentation', () => {
  it('localizes owned wrappers while preserving Skill identities', () => {
    const context = createTestAgentTerminalPresentation('zh-cn');
    expect(presentSkillCommand({ kind: 'invoked', skillName: 'review-code' }, context)).toEqual({
      kind: 'output',
      output: '已调用 Skill：review-code',
    });
    expect(presentSkillMenu(context)).toEqual({
      title: '选择 Skill',
    });
  });

  it('localizes direct invocation diagnostics without translating stable values', () => {
    const detail = 'EACCES: /external/路径';
    const en = presentSkillCommand(
      { kind: 'load-failed', skillName: 'review-原文', detail },
      createTestAgentTerminalPresentation('en'),
    );
    const zh = presentSkillCommand(
      { kind: 'load-failed', skillName: 'review-原文', detail },
      createTestAgentTerminalPresentation('zh-cn'),
    );

    expect(en).toEqual({
      kind: 'error',
      diagnosticCode: 'skill.load-failed',
      error: 'Failed to load Skill review-原文: EACCES: /external/路径',
    });
    expect(zh).toEqual({
      kind: 'error',
      diagnosticCode: 'skill.load-failed',
      error: '加载 Skill review-原文 失败：EACCES: /external/路径',
    });
  });

  it('uses explicit diagnostics for invalid invocation, unavailable service, and empty content', () => {
    const context = createTestAgentTerminalPresentation('zh-cn');

    expect(
      presentSkillCommand({ kind: 'invocation-invalid', input: '$原始 input' }, context),
    ).toEqual({
      kind: 'error',
      diagnosticCode: 'skill.invocation-invalid',
      error: '无效的 Skill 调用：$原始 input',
    });
    expect(presentSkillCommand({ kind: 'service-unavailable' }, context)).toEqual({
      kind: 'error',
      diagnosticCode: 'skill.service-unavailable',
      error: '当前会话未提供 Skill 服务。',
    });
    expect(presentSkillCommand({ kind: 'no-content', skillName: 'empty-skill' }, context)).toEqual({
      kind: 'error',
      diagnosticCode: 'skill.no-content',
      error: 'Skill 没有提示词内容：empty-skill',
    });
  });

  it('projects a locale-stable diagnostic code', () => {
    const result = { kind: 'not-found', skillName: 'missing-skill' } as const;
    expect(presentSkillCommand(result, createTestAgentTerminalPresentation('en'))).toMatchObject({
      kind: 'error',
      diagnosticCode: 'skill.not-found',
    });
    expect(presentSkillCommand(result, createTestAgentTerminalPresentation('zh-cn'))).toMatchObject(
      { kind: 'error', diagnosticCode: 'skill.not-found' },
    );
  });
});
