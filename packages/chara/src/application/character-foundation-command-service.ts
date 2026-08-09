import type { CharacterFoundationCommand } from '@neko/chara/contracts';

type CommandInput<TOperation extends CharacterFoundationCommand['operation']> = Extract<
  CharacterFoundationCommand,
  { readonly operation: TOperation }
>['input'];

export interface CharacterFoundationCommandPort {
  execute(command: CharacterFoundationCommand, signal?: AbortSignal): Promise<void>;
}

export class CharacterFoundationCommandService implements CharacterFoundationCommandPort {
  constructor(
    private readonly services: {
      readonly characterAuthoring: {
        createProject(
          input: CommandInput<'character-project-create'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        updateDraft(
          input: CommandInput<'character-project-update-draft'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        setReviewStatus(
          input: CommandInput<'character-project-set-review'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        publish(
          input: CommandInput<'character-version-publish'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
      };
      readonly relationships: {
        create(input: CommandInput<'relationship-create'>, signal?: AbortSignal): Promise<unknown>;
      };
      readonly interactions: {
        createDialogue(
          input: CommandInput<'dialogue-create'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
      };
      readonly rooms: {
        createRoom(
          input: CommandInput<'character-room-create'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
      };
      readonly roomInteractions: {
        createRun(input: CommandInput<'room-run-create'>, signal?: AbortSignal): Promise<unknown>;
      };
      readonly worldAuthoring: {
        createProject(
          input: CommandInput<'world-project-create'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        updateDraft(
          input: CommandInput<'world-project-update-draft'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        setReviewStatus(
          input: CommandInput<'world-project-set-review'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        publish(
          input: CommandInput<'world-version-publish'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
      };
      readonly worldRuntime: {
        createRun(input: CommandInput<'world-run-create'>, signal?: AbortSignal): Promise<unknown>;
      };
    },
  ) {}

  async execute(command: CharacterFoundationCommand, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    switch (command.operation) {
      case 'character-project-create':
        await this.services.characterAuthoring.createProject(command.input, signal);
        return;
      case 'character-project-update-draft':
        await this.services.characterAuthoring.updateDraft(command.input, signal);
        return;
      case 'character-project-set-review':
        await this.services.characterAuthoring.setReviewStatus(command.input, signal);
        return;
      case 'character-version-publish':
        await this.services.characterAuthoring.publish(command.input, signal);
        return;
      case 'relationship-create':
        await this.services.relationships.create(command.input, signal);
        return;
      case 'dialogue-create':
        await this.services.interactions.createDialogue(command.input, signal);
        return;
      case 'character-room-create':
        await this.services.rooms.createRoom(command.input, signal);
        return;
      case 'room-run-create':
        await this.services.roomInteractions.createRun(command.input, signal);
        return;
      case 'world-project-create':
        await this.services.worldAuthoring.createProject(command.input, signal);
        return;
      case 'world-project-update-draft':
        await this.services.worldAuthoring.updateDraft(command.input, signal);
        return;
      case 'world-project-set-review':
        await this.services.worldAuthoring.setReviewStatus(command.input, signal);
        return;
      case 'world-version-publish':
        await this.services.worldAuthoring.publish(command.input, signal);
        return;
      case 'world-run-create':
        await this.services.worldRuntime.createRun(command.input, signal);
        return;
    }
  }
}
