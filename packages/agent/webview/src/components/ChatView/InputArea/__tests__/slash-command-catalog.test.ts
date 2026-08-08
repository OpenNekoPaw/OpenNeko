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
    const translate = (key: string) => key;

    expect(filterSlashCommands(projected.commands, 'exact', translate)).toHaveLength(1);
    expect(filterSkillInvocations(projected.skills, 'context', translate)).toHaveLength(1);
    expect(extractSlashCommandArgs('/compact keep recent', projected.commands[0]!)).toBe(
      'keep recent',
    );
    expect(extractSlashCommandArgs('/other keep recent', projected.commands[0]!)).toBeUndefined();
  });

  it('keeps literal descriptions and Host source labels in menu projections', () => {
    const projected = projectAgentComposerInputCatalog({
      entries: [compactEntry, workspaceSkillEntry],
      phase: 'session',
      bindingKind: 'workspace',
    });
    const command = projected.commands[0]!;
    const skill = projected.skills[0]!;

    expect(resolveSlashCommandDescription(command, () => 'translated')).toBe(
      'Compact the exact Conversation',
    );
    expect(resolveSlashCommandSourceLabel(command)).toBeNull();
    expect(resolveSkillInvocationSourceLabel(skill)).toBe('project');
  });
});
