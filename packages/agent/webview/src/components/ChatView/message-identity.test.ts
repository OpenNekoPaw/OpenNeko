import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CharacterDialogueSessionProjection,
  EmbodyCharacterSessionProjection,
} from '@neko/agent-contracts';
import { setLocale, t } from '../../i18n';
import { projectMessageIdentities, selectMessageIdentity } from './message-identity';

describe('projectMessageIdentities', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('uses default identities for normal chat', () => {
    expect(projectMessageIdentities({ conversationKind: 'chat' }, t)).toEqual({
      user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
      assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
    });
  });

  it('projects character dialogue assistant as the character', () => {
    const identities = projectMessageIdentities(
      {
        conversationKind: 'character-dialogue',
        characterDialogueSession: createCharacterDialogueSession(),
      },
      t,
    );

    expect(identities.user.displayName).toBe('You');
    expect(identities.assistant.displayName).toBe('小橘');
    expect(identities.assistant.avatarLabel).toBe('小橘');
    expect(identities.assistant.avatarUri).toBeUndefined();
    expect(identities.assistant.title).toBe('小橘 (Character Dialogue)');
  });

  it('localizes message identities for a Character Dialogue session', () => {
    setLocale('zh-cn');

    const identities = projectMessageIdentities(
      {
        conversationKind: 'character-dialogue',
        characterDialogueSession: createCharacterDialogueSession(),
      },
      t,
    );

    expect(identities.user.displayName).toBe('你');
    expect(identities.user.avatarLabel).toBe('你');
    expect(identities.assistant.title).toBe('小橘（角色扮演）');
  });

  it('localizes default and Embody Character message identities', () => {
    setLocale('zh-cn');

    expect(projectMessageIdentities({ conversationKind: 'chat' }, t)).toEqual({
      user: { displayName: '你', avatarLabel: '你', title: '你' },
      assistant: { displayName: '助手', avatarLabel: 'AI', title: '助手' },
    });

    const identities = projectMessageIdentities(
      {
        conversationKind: 'embody-character',
        embodyCharacterSession: createEmbodyCharacterSession(),
      },
      t,
    );
    expect(identities.user.displayName).toBe('你扮演的小橘');
    expect(identities.assistant.displayName).toBe('角色反馈');
    expect(identities.assistant.avatarLabel).toBe('反馈');
  });

  it('does not treat durable representation bindings as Webview avatar URIs', () => {
    const identities = projectMessageIdentities(
      {
        conversationKind: 'character-dialogue',
        characterDialogueSession: createCharacterDialogueSession({
          representationBindings: [
            {
              role: 'portrait',
              representation: {
                kind: 'media-library',
                libraryName: 'Characters',
                relativePath: 'xiaoju.png',
              },
              isDefault: true,
            },
          ],
        }),
      },
      t,
    );

    expect(identities.assistant.avatarUri).toBeUndefined();
  });

  it('projects embody character user as the character and assistant as feedback', () => {
    const identities = projectMessageIdentities(
      {
        conversationKind: 'embody-character',
        embodyCharacterSession: createEmbodyCharacterSession(),
      },
      t,
    );

    expect(identities.user.displayName).toBe('You as 小橘');
    expect(identities.user.avatarLabel).toBe('小橘');
    expect(identities.user.avatarUri).toBeUndefined();
    expect(identities.assistant.displayName).toBe('Character feedback');
    expect(identities.assistant.avatarLabel).toBe('CF');
  });

  it('selects the identity for each message role', () => {
    const identities = projectMessageIdentities(
      {
        conversationKind: 'character-dialogue',
        characterDialogueSession: createCharacterDialogueSession(),
      },
      t,
    );

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
            kind: 'media-library',
            libraryName: 'Characters',
            relativePath: 'xiaoju-portrait.png',
          },
          isDefault: true,
        },
        {
          role: 'portrait',
          representation: {
            kind: 'media-library',
            libraryName: 'Characters',
            relativePath: 'xiaoju.png',
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
            kind: 'media-library',
            libraryName: 'Characters',
            relativePath: 'xiaoju.png',
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
