import type {
  CharacterDialogueSessionProjection,
  ConversationKind,
  EmbodyCharacterSessionProjection,
  Message,
} from '@neko-agent/types';

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

export const DEFAULT_MESSAGE_IDENTITIES: MessageIdentityMap = {
  user: {
    displayName: 'You',
    avatarLabel: 'You',
    title: 'You',
  },
  assistant: {
    displayName: 'Assistant',
    avatarLabel: 'AI',
    title: 'Assistant',
  },
};

export function projectMessageIdentities(input: MessageIdentityInput): MessageIdentityMap {
  if (input.conversationKind === 'character-dialogue' && input.characterDialogueSession) {
    const characterName = input.characterDialogueSession.displayName;
    return {
      user: DEFAULT_MESSAGE_IDENTITIES.user,
      assistant: {
        displayName: characterName,
        avatarLabel: characterName,
        title: `${characterName} (Character Dialogue)`,
      },
    };
  }

  if (input.conversationKind === 'embody-character' && input.embodyCharacterSession) {
    const characterName = input.embodyCharacterSession.displayName;
    return {
      user: {
        displayName: `You as ${characterName}`,
        avatarLabel: characterName,
        title: `You as ${characterName}`,
      },
      assistant: {
        displayName: 'Character feedback',
        avatarLabel: 'CF',
        title: 'Character feedback',
      },
    };
  }

  return DEFAULT_MESSAGE_IDENTITIES;
}

export function selectMessageIdentity(
  identities: MessageIdentityMap,
  role: Extract<Message['role'], 'user' | 'assistant'>,
): MessageSpeakerIdentity {
  return role === 'user' ? identities.user : identities.assistant;
}
