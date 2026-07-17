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
        avatarUri: projectCharacterAvatarUri(input.characterDialogueSession.profile),
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
        avatarUri: projectCharacterAvatarUri(input.embodyCharacterSession.profile),
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

function projectCharacterAvatarUri(profile: {
  readonly representationBindings?: readonly {
    readonly assetRef: string;
    readonly isDefault?: boolean;
  }[];
}): string | undefined {
  const bindings = profile.representationBindings ?? [];
  const defaultBinding = bindings.find((candidate) => candidate.isDefault);
  const candidateRefs = [
    ...(defaultBinding ? [defaultBinding.assetRef] : []),
    ...bindings.map((binding) => binding.assetRef),
  ];
  return candidateRefs.find(isRenderableAvatarUri);
}

function isRenderableAvatarUri(uri: string): boolean {
  try {
    const protocol = new URL(uri).protocol;
    return (
      protocol === 'blob:' ||
      protocol === 'data:' ||
      protocol === 'http:' ||
      protocol === 'https:' ||
      protocol === 'vscode-resource:' ||
      protocol === 'vscode-webview:' ||
      protocol === 'vscode-webview-resource:' ||
      protocol === 'webview:'
    );
  } catch {
    return false;
  }
}
