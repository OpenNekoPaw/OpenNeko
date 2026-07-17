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
    expect(identities.assistant.avatarUri).toBe('vscode-webview://avatars/xiaoju.png');
    expect(identities.assistant.title).toBe('小橘 (Character Dialogue)');
  });

  it('accepts VS Code webview resource avatar URIs', () => {
    const identities = projectMessageIdentities({
      conversationKind: 'character-dialogue',
      characterDialogueSession: createCharacterDialogueSession({
        representationBindings: [
          {
            role: 'portrait',
            assetRef: 'vscode-webview-resource://avatar/xiaoju.png',
            isDefault: true,
          },
        ],
      }),
    });

    expect(identities.assistant.avatarUri).toBe('vscode-webview-resource://avatar/xiaoju.png');
  });

  it('projects embody character user as the character and assistant as feedback', () => {
    const identities = projectMessageIdentities({
      conversationKind: 'embody-character',
      embodyCharacterSession: createEmbodyCharacterSession(),
    });

    expect(identities.user.displayName).toBe('You as 小橘');
    expect(identities.user.avatarLabel).toBe('小橘');
    expect(identities.user.avatarUri).toBe('data:image/png;base64,avatar');
    expect(identities.assistant.displayName).toBe('Character feedback');
    expect(identities.assistant.avatarLabel).toBe('CF');
  });

  it('does not expose project asset refs as image URIs', () => {
    const identities = projectMessageIdentities({
      conversationKind: 'character-dialogue',
      characterDialogueSession: createCharacterDialogueSession({
        representationBindings: [
          {
            role: 'portrait',
            assetRef: 'project://assets/xiaoju-portrait',
            isDefault: true,
          },
        ],
      }),
    });

    expect(identities.assistant.avatarUri).toBeUndefined();
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
          assetRef: 'project://assets/xiaoju-portrait',
          isDefault: true,
        },
        {
          role: 'portrait',
          assetRef: 'vscode-webview://avatars/xiaoju.png',
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
          assetRef: 'data:image/png;base64,avatar',
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
