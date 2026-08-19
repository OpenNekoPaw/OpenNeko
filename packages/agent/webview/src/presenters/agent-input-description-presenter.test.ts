import { describe, expect, it } from 'vitest';
import {
  projectCommandDescription,
  projectSkillDescription,
  resolveAgentInputDescription,
} from './agent-input-description-presenter';

describe('agent-input-description-presenter', () => {
  it('projects exact OpenNeko builtin commands and Skills through the Webview locale catalog', () => {
    const command = projectCommandDescription({
      name: 'new',
      canonicalDescription: 'Start a new conversation',
      isOpenNekoBuiltin: true,
    });
    const skill = projectSkillDescription({
      name: 'character-creator',
      canonicalDescription: 'Canonical portable description',
      isOpenNekoBuiltin: true,
    });

    expect(command).toEqual({
      descriptionKey: 'commandDescriptions.new',
      descriptionKind: 'i18n',
    });
    expect(skill).toEqual({
      descriptionKey: 'skillDescriptions.character-creator',
      descriptionKind: 'i18n',
    });
    expect(resolveAgentInputDescription(command, () => '开始新对话')).toBe('开始新对话');
  });

  it('does not overwrite third-party inputs that reuse builtin names', () => {
    const command = projectCommandDescription({
      name: 'new',
      canonicalDescription: 'Plugin package command',
      isOpenNekoBuiltin: false,
    });
    const skill = projectSkillDescription({
      name: 'character-creator',
      canonicalDescription: 'Third-party package description',
      isOpenNekoBuiltin: false,
    });

    expect(command).toEqual({
      descriptionKey: 'Plugin package command',
      descriptionKind: 'literal',
    });
    expect(skill).toEqual({
      descriptionKey: 'Third-party package description',
      descriptionKind: 'literal',
    });
    expect(resolveAgentInputDescription(command, () => '不应使用')).toBe('Plugin package command');
  });

  it('keeps an unmapped builtin description visible as canonical source text', () => {
    expect(
      projectSkillDescription({
        name: 'future-builtin',
        canonicalDescription: 'Future builtin description',
        isOpenNekoBuiltin: true,
      }),
    ).toEqual({
      descriptionKey: 'Future builtin description',
      descriptionKind: 'literal',
    });
  });

  it('localizes presentation without changing the canonical Skill fingerprint or description', () => {
    const canonical = Object.freeze({
      name: 'character-creator',
      description: 'Canonical portable description',
      fingerprint: 'sha256:portable-package',
    });
    const projection = projectSkillDescription({
      name: canonical.name,
      canonicalDescription: canonical.description,
      isOpenNekoBuiltin: true,
    });

    expect(resolveAgentInputDescription(projection, () => 'Create a character draft.')).toBe(
      'Create a character draft.',
    );
    expect(resolveAgentInputDescription(projection, () => '创建可审阅的角色草稿。')).toBe(
      '创建可审阅的角色草稿。',
    );
    expect(canonical).toEqual({
      name: 'character-creator',
      description: 'Canonical portable description',
      fingerprint: 'sha256:portable-package',
    });
  });
});
