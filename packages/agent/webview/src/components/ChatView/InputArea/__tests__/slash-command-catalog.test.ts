import { describe, expect, it } from 'vitest';
import type { AgentInputCatalogEntry } from '@neko/agent-contracts';
import {
  extractSlashCommandArgs,
  filterSkillInvocations,
  filterSlashCommands,
  projectAgentComposerInputCatalog,
  resolveAgentInputInvocationIntent,
  resolveSkillInvocationSourceLabel,
  resolveSlashCommandDescription,
  resolveSlashCommandSourceLabel,
} from '../slash-command-catalog';

const compactEntry: AgentInputCatalogEntry = {
  id: 'command:builtin:compact',
  name: 'compact',
  description: 'Compact the exact Conversation',
  trigger: 'command',
  prefix: '/',
  phaseRequirement: 'session',
  bindingRequirement: 'any',
  source: { kind: 'builtin', sourceId: 'compact' },
  availability: { status: 'available' },
  executable: {
    kind: 'command',
    commandId: 'compact',
    handlerId: 'builtin:compact',
  },
};

const workspaceSkillEntry: AgentInputCatalogEntry = {
  id: 'skill:project:workspace-skill',
  name: 'workspace-skill',
  description: 'Use exact Workspace context',
  trigger: 'skill',
  prefix: '$',
  phaseRequirement: 'any',
  bindingRequirement: 'workspace',
  source: {
    kind: 'project',
    workspaceId: 'workspace-1',
    sourceId: 'skill-fingerprint-1',
  },
  availability: { status: 'available' },
  executable: {
    kind: 'skill',
    skillName: 'workspace-skill',
    activationId: 'skill:project:skill:skill-fingerprint-1',
  },
};

describe('slash-command-catalog', () => {
  it('projects Draft and Session menus from the same exact Host catalog semantics', () => {
    const entries = [compactEntry, workspaceSkillEntry];

    const draft = projectAgentComposerInputCatalog({
      entries,
      phase: 'draft',
      bindingKind: 'workspace',
    });
    const session = projectAgentComposerInputCatalog({
      entries,
      phase: 'session',
      bindingKind: 'assistant',
    });

    expect(draft.commands).toEqual([]);
    expect(draft.skills).toEqual([
      expect.objectContaining({
        id: workspaceSkillEntry.id,
        skillName: 'workspace-skill',
        name: '$workspace-skill',
        source: 'project',
      }),
    ]);
    expect(session.commands).toEqual([
      expect.objectContaining({
        id: compactEntry.id,
        commandId: 'compact',
        name: '/compact',
        source: 'builtin',
      }),
    ]);
    expect(session.skills).toEqual([]);
  });

  it('builds command and Skill intents with exact executable receipts', () => {
    expect(
      resolveAgentInputInvocationIntent({
        trigger: {
          trigger: 'command',
          prefix: '/',
          name: 'compact',
          args: '--now',
          startIndex: 0,
          endIndex: 8,
          rawToken: 'compact',
        },
        entries: [compactEntry],
        phase: 'session',
        bindingKind: 'assistant',
      }),
    ).toEqual({
      kind: 'command',
      catalogEntryId: compactEntry.id,
      commandId: 'compact',
      handlerId: 'builtin:compact',
      args: '--now',
    });

    expect(
      resolveAgentInputInvocationIntent({
        trigger: {
          trigger: 'skill',
          prefix: '$',
          name: 'workspace-skill',
          startIndex: 0,
          endIndex: 16,
          rawToken: 'workspace-skill',
        },
        entries: [workspaceSkillEntry],
        phase: 'session',
        bindingKind: 'workspace',
      }),
    ).toEqual({
      kind: 'skill',
      catalogEntryId: workspaceSkillEntry.id,
      skillName: 'workspace-skill',
      activationId: 'skill:project:skill:skill-fingerprint-1',
    });
  });

  it('rejects stale, unavailable and wrong-binding triggers without a name fallback', () => {
    const trigger = {
      trigger: 'skill' as const,
      prefix: '$' as const,
      name: 'workspace-skill',
      startIndex: 0,
      endIndex: 16,
      rawToken: 'workspace-skill',
    };

    expect(() =>
      resolveAgentInputInvocationIntent({
        trigger,
        entries: [],
        phase: 'session',
        bindingKind: 'workspace',
      }),
    ).toThrow("Agent input '$workspace-skill' is unknown or stale.");
    expect(() =>
      resolveAgentInputInvocationIntent({
        trigger,
        entries: [workspaceSkillEntry],
        phase: 'session',
        bindingKind: 'assistant',
      }),
    ).toThrow("Agent input '$workspace-skill' is unavailable for this session binding.");

    const unavailable: AgentInputCatalogEntry = {
      ...workspaceSkillEntry,
      availability: {
        status: 'unavailable',
        diagnostic: {
          code: 'character-policy-denied',
          owner: 'chara',
          message: 'This Skill is not allowed for the Character interaction.',
        },
      },
    };
    expect(() =>
      resolveAgentInputInvocationIntent({
        trigger,
        entries: [unavailable],
        phase: 'session',
        bindingKind: 'workspace',
      }),
    ).toThrow(
      '[chara/character-policy-denied] This Skill is not allowed for the Character interaction.',
    );
  });

  it('filters canonical menu projections and extracts only matching command arguments', () => {
    const projected = projectAgentComposerInputCatalog({
      entries: [compactEntry, workspaceSkillEntry],
      phase: 'session',
      bindingKind: 'workspace',
    });
    const translate = (key: string) =>
      key === 'commandDescriptions.compact' ? 'Compact the exact Conversation' : key;

    expect(filterSlashCommands(projected.commands, 'exact', translate)).toHaveLength(1);
    expect(filterSkillInvocations(projected.skills, 'context', translate)).toHaveLength(1);
    expect(extractSlashCommandArgs('/compact keep recent', projected.commands[0]!)).toBe(
      'keep recent',
    );
    expect(extractSlashCommandArgs('/other keep recent', projected.commands[0]!)).toBeUndefined();
  });

  it('localizes only exact builtin command descriptions in menu projections', () => {
    const artifactWithSameName: AgentInputCatalogEntry = {
      ...compactEntry,
      id: 'command:project:compact',
      description: 'Project-authored compact command',
      phaseRequirement: 'any',
      bindingRequirement: 'workspace',
      source: {
        kind: 'project',
        workspaceId: 'workspace-1',
        sourceId: 'compact-artifact',
      },
      executable: {
        kind: 'command',
        commandId: 'compact',
        handlerId: 'command:project:compact-artifact',
      },
    };
    const projected = projectAgentComposerInputCatalog({
      entries: [compactEntry, artifactWithSameName, workspaceSkillEntry],
      phase: 'session',
      bindingKind: 'workspace',
    });
    const builtinCommand = projected.commands[0]!;
    const artifactCommand = projected.commands[1]!;
    const skill = projected.skills[0]!;

    expect(builtinCommand).toEqual(
      expect.objectContaining({
        descriptionKey: 'commandDescriptions.compact',
        descriptionKind: 'i18n',
      }),
    );
    expect(resolveSlashCommandDescription(builtinCommand, () => '压缩对话上下文')).toBe(
      '压缩对话上下文',
    );
    expect(artifactCommand).toEqual(
      expect.objectContaining({
        descriptionKey: 'Project-authored compact command',
        descriptionKind: 'literal',
      }),
    );
    expect(resolveSlashCommandDescription(artifactCommand, () => '不应使用')).toBe(
      'Project-authored compact command',
    );
    expect(resolveSlashCommandSourceLabel(builtinCommand)).toBeNull();
    expect(resolveSlashCommandSourceLabel(artifactCommand)).toBe('command');
    expect(resolveSkillInvocationSourceLabel(skill)).toBe('project');
  });

  it('localizes only exact builtin Skill descriptions in menu projections', () => {
    const builtin: AgentInputCatalogEntry = {
      ...workspaceSkillEntry,
      id: 'skill:builtin:character-creator',
      name: 'character-creator',
      description: 'Canonical builtin description',
      bindingRequirement: 'any',
      source: { kind: 'builtin', sourceId: 'character-creator' },
      executable: {
        kind: 'skill',
        skillName: 'character-creator',
        activationId: 'skill:builtin:character-creator',
      },
    };
    const personalWithSameName: AgentInputCatalogEntry = {
      ...builtin,
      id: 'skill:personal:character-creator',
      description: 'Personal package description',
      source: {
        kind: 'personal',
        ownerId: 'assistant:default',
        sourceId: 'personal-character-creator',
      },
      executable: {
        kind: 'skill',
        skillName: 'character-creator',
        activationId: 'skill:personal:character-creator',
      },
    };

    const builtinProjection = projectAgentComposerInputCatalog({
      entries: [builtin],
      phase: 'draft',
      bindingKind: 'assistant',
    }).skills[0]!;
    const personalProjection = projectAgentComposerInputCatalog({
      entries: [personalWithSameName],
      phase: 'draft',
      bindingKind: 'assistant',
    }).skills[0]!;

    expect(builtinProjection).toEqual(
      expect.objectContaining({
        descriptionKey: 'skillDescriptions.character-creator',
        descriptionKind: 'i18n',
      }),
    );
    expect(resolveSlashCommandDescription(builtinProjection, () => '本地化角色创作说明')).toBe(
      '本地化角色创作说明',
    );
    expect(personalProjection).toEqual(
      expect.objectContaining({
        descriptionKey: 'Personal package description',
        descriptionKind: 'literal',
      }),
    );
  });
});
