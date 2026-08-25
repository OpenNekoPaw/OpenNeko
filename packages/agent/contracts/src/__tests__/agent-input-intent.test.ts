import { describe, expect, it } from 'vitest';
import {
  parseAgentDraftInputIntent,
  parseAgentInputInvocationIntent,
  parseAgentInputReferenceReceipt,
} from '../agent-input-intent';

describe('Agent input intent contract', () => {
  it('parses ordinary message, command, and Skill intents exactly', () => {
    expect(parseAgentDraftInputIntent({ kind: 'message', text: 'Hello' })).toEqual({
      kind: 'message',
      text: 'Hello',
    });
    expect(
      parseAgentDraftInputIntent({
        kind: 'command',
        catalogEntryId: 'command:compact',
        commandId: 'compact',
        handlerId: 'dsh:compact',
      }),
    ).toEqual({
      kind: 'command',
      catalogEntryId: 'command:compact',
      commandId: 'compact',
      handlerId: 'dsh:compact',
    });
    expect(
      parseAgentDraftInputIntent({
        kind: 'skill',
        catalogEntryId: 'skill:storyboard',
        skillName: 'storyboard',
        activationId: 'activation:storyboard',
        args: 'three shots',
      }),
    ).toEqual({
      kind: 'skill',
      catalogEntryId: 'skill:storyboard',
      skillName: 'storyboard',
      activationId: 'activation:storyboard',
      args: 'three shots',
    });
  });

  it('rejects an ordinary message as a command or Skill invocation', () => {
    expect(() => parseAgentInputInvocationIntent({ kind: 'message', text: 'Hello' })).toThrow(
      'cannot be an ordinary message',
    );
  });

  it('preserves an exact owner-qualified reference receipt', () => {
    expect(
      parseAgentInputReferenceReceipt({
        catalogEntryId: 'mention:workspace-1:brief',
        referenceId: 'workspace-file:brief',
        ownerKind: 'workspace',
        ownerId: 'workspace-1',
        bindingReceiptId: 'binding-1',
      }),
    ).toEqual({
      catalogEntryId: 'mention:workspace-1:brief',
      referenceId: 'workspace-file:brief',
      ownerKind: 'workspace',
      ownerId: 'workspace-1',
      bindingReceiptId: 'binding-1',
    });
  });

  it('rejects missing identities, unknown owners, and retired submit fields', () => {
    expect(() =>
      parseAgentDraftInputIntent({
        kind: 'skill',
        catalogEntryId: 'skill:storyboard',
        skillName: 'storyboard',
        activationId: '',
      }),
    ).toThrow('Skill selection identity is required');
    expect(() =>
      parseAgentInputReferenceReceipt({
        catalogEntryId: 'mention:brief',
        referenceId: 'brief',
        ownerKind: 'project',
        ownerId: 'project-1',
      }),
    ).toThrow("Unknown Agent reference owner 'project'");
    expect(() =>
      parseAgentDraftInputIntent({
        kind: 'message',
        text: 'Hello',
        draft: { draftId: 'retired-draft' },
      }),
    ).toThrow("unsupported field 'draft'");
  });
});
