import { describe, expect, it } from 'vitest';
import type {
  CharacterDialogueSessionProjection,
  EmbodyCharacterSessionProjection,
} from '@neko-agent/types';
import {
  DEFAULT_MESSAGE_IDENTITIES,
  projectMessageIdentities,
  selectMessageIdentity,
} from './message-identity';

describe('projectMessageIdentities', () => {
  it('uses default identities for normal chat', () => {
    expect(projectMessageIdentities({ conversationKind: 'chat' })).toEqual(
      DEFAULT_MESSAGE_IDENTITIES,
    );
  });

  it('projects character dialogue assistant as the character', () => {
    const identities = projectMessageIdentities({
      conversationKind: 'character-dialogue',
      characterDialogueSession: createCharacterDialogueSession(),
    });

    expect(identities.user.displayName).toBe('You');
    expect(identities.assistant.displayName).toBe('小橘');
    expect(identities.assistant.avatarLabel).toBe('小橘');
    expect(identities.assistant.avatarUri).toBeUndefined();
    expect(identities.assistant.title).toBe('小橘 (Character Dialogue)');
  });

  it('does not treat durable representation bindings as Webview avatar URIs', () => {
    const identities = projectMessageIdentities({
      conversationKind: 'character-dialogue',
      characterDialogueSession: createCharacterDialogueSession({
        representationBindings: [
          {
            role: 'portrait',
            representation: {
              kind: 'workspace-file',
              path: 'neko/assets/Characters/xiaoju.png',
            },
            isDefault: true,
          },
        ],
      }),
    });

    expect(identities.assistant.avatarUri).toBeUndefined();
  });

  it('projects embody character user as the character and assistant as feedback', () => {
    const identities = projectMessageIdentities({
      conversationKind: 'embody-character',
      embodyCharacterSession: createEmbodyCharacterSession(),
    });

    expect(identities.user.displayName).toBe('You as 小橘');
    expect(identities.user.avatarLabel).toBe('小橘');
    expect(identities.user.avatarUri).toBeUndefined();
    expect(identities.assistant.displayName).toBe('Character feedback');
    expect(identities.assistant.avatarLabel).toBe('CF');
  });

  it('selects the identity for each message role', () => {
    const identities = projectMessageIdentities({
      conversationKind: 'character-dialogue',
      characterDialogueSession: createCharacterDialogueSession(),
    });

    expect(selectMessageIdentity(identities, 'user')).toBe(identities.user);
    expect(selectMessageIdentity(identities, 'assistant')).toBe(identities.assistant);
  });
});

function createCharacterDialogueSession(
  profileOverrides: Partial<CharacterDialogueSessionProjection['profile']> = {},
): CharacterDialogueSessionProjection {
  return {
    sessionId: 'dialogue-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    mode: 'roleplay',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: ['Xiaoju'],
      facts: [],
      sparsity: 'partial',
      representationBindings: [
        {
          role: 'portrait',
          representation: {
            kind: 'workspace-file',
            path: 'neko/assets/Characters/xiaoju-portrait.png',
          },
          isDefault: true,
        },
        {
          role: 'portrait',
          representation: {
            kind: 'workspace-file',
            path: 'neko/assets/Characters/xiaoju.png',
          },
        },
      ],
      ...profileOverrides,
    },
    summary: 'protagonist',
    startedAt: '2026-06-01T00:00:00.000Z',
    status: 'active',
  };
}

function createEmbodyCharacterSession(): EmbodyCharacterSessionProjection {
  return {
    sessionId: 'embody-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: ['Xiaoju'],
      facts: [],
      sparsity: 'partial',
      representationBindings: [
        {
          role: 'portrait',
          representation: {
            kind: 'workspace-file',
            path: 'neko/assets/Characters/xiaoju.png',
          },
          isDefault: true,
        },
      ],
    },
    scopeSummary: [],
    summary: 'protagonist',
    startedAt: '2026-06-02T00:00:00.000Z',
    status: 'active',
  };
}
