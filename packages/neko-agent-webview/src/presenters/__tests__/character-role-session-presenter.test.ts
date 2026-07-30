import { describe, expect, it } from 'vitest';
import { t, setLocale } from '@/i18n';
import { projectCharacterFactLabel } from '../character-role-session-presenter';

describe('projectCharacterFactLabel', () => {
  it('localizes canonical and dynamic character fact keys', () => {
    setLocale('zh-cn');

    expect(projectCharacterFactLabel('identity.name', t)).toBe('姓名');
    expect(projectCharacterFactLabel('occurrence.scene', t)).toBe('出现场景');
    expect(projectCharacterFactLabel('relationship.char-ahui.friend', t)).toBe('角色关系');
    expect(projectCharacterFactLabel('agent.habit', t)).toBe('推断信息');
  });

  it('keeps an unknown stable key visible without presenting it as translated', () => {
    setLocale('zh-cn');

    expect(projectCharacterFactLabel('custom.projectFact', t)).toBe(
      '其他信息（custom.projectFact）',
    );
  });
});
