import type {
  CharacterDialogueSessionProjection,
  ConversationKind,
  EmbodyCharacterSessionProjection,
  Message,
} from '@neko-agent/contracts';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface MessageSpeakerIdentity {
  readonly displayName: string;
  readonly avatarLabel: string;
  readonly avatarUri?: string;
  readonly title: string;
}

export interface MessageIdentityMap {
  readonly user: MessageSpeakerIdentity;
  readonly assistant: MessageSpeakerIdentity;
}

export interface MessageIdentityInput {
  readonly conversationKind: ConversationKind;
  readonly characterDialogueSession?: CharacterDialogueSessionProjection;
  readonly embodyCharacterSession?: EmbodyCharacterSessionProjection;
}

export function projectMessageIdentities(
  input: MessageIdentityInput,
  translate: Translate,
): MessageIdentityMap {
  const defaultIdentities = projectDefaultMessageIdentities(translate);

  if (input.conversationKind === 'character-dialogue' && input.characterDialogueSession) {
    const characterName = input.characterDialogueSession.displayName;
    return {
      user: defaultIdentities.user,
      assistant: {
        displayName: characterName,
        avatarLabel: characterName,
        title: translate('characterRole.identity.characterDialogue', {
          character: characterName,
        }),
      },
    };
  }

  if (input.conversationKind === 'embody-character' && input.embodyCharacterSession) {
    const characterName = input.embodyCharacterSession.displayName;
    const userAsCharacter = translate('characterRole.identity.youAsCharacter', {
      character: characterName,
    });
    return {
      user: {
        displayName: userAsCharacter,
        avatarLabel: characterName,
        title: userAsCharacter,
      },
      assistant: {
        displayName: translate('characterRole.identity.feedback'),
        avatarLabel: translate('characterRole.identity.feedbackAvatar'),
        title: translate('characterRole.identity.feedback'),
      },
    };
  }

  return defaultIdentities;
}

export function selectMessageIdentity(
  identities: MessageIdentityMap,
  role: Extract<Message['role'], 'user' | 'assistant'>,
): MessageSpeakerIdentity {
  return role === 'user' ? identities.user : identities.assistant;
}

function projectDefaultMessageIdentities(translate: Translate): MessageIdentityMap {
  const user = translate('characterRole.identity.you');
  const assistant = translate('characterRole.identity.assistant');
  return {
    user: {
      displayName: user,
      avatarLabel: user,
      title: user,
    },
    assistant: {
      displayName: assistant,
      avatarLabel: 'AI',
      title: assistant,
    },
  };
}
