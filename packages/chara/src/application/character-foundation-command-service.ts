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
        propose(
          input: CommandInput<'relationship-memory-candidate-propose'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        accept(
          input: CommandInput<'relationship-memory-candidate-accept'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        reject(
          input: CommandInput<'relationship-memory-candidate-reject'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        correctMemory(
          input: CommandInput<'relationship-memory-correct'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        deleteMemory(
          input: CommandInput<'relationship-memory-delete'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
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
      readonly presentation: {
        updateConfigurations(
          input: readonly CommandInput<'character-presentation-configure'>[],
          signal?: AbortSignal,
        ): Promise<unknown>;
      };
      readonly storylines: {
        publish(
          input: CommandInput<'character-storyline-publish'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        createRun(
          input: CommandInput<'character-storyline-run-create'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        proposeObservation(
          input: CommandInput<'character-storyline-observation-propose'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        acceptObservation(
          input: CommandInput<'character-storyline-observation-accept'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        rejectObservation(
          input: CommandInput<'character-storyline-observation-reject'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
      };
      readonly memories: {
        createScope(
          input: CommandInput<'character-memory-scope-create'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        propose(
          input: CommandInput<'character-memory-candidate-propose'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        accept(
          input: CommandInput<'character-memory-candidate-accept'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        reject(
          input: CommandInput<'character-memory-candidate-reject'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        correct(
          input: CommandInput<'character-memory-candidate-correct'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        delete(
          input: CommandInput<'character-memory-entry-delete'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
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
      case 'relationship-memory-candidate-propose':
        await this.services.relationships.propose(command.input, signal);
        return;
      case 'relationship-memory-candidate-accept':
        await this.services.relationships.accept(command.input, signal);
        return;
      case 'relationship-memory-candidate-reject':
        await this.services.relationships.reject(command.input, signal);
        return;
      case 'relationship-memory-correct':
        await this.services.relationships.correctMemory(command.input, signal);
        return;
      case 'relationship-memory-delete':
        await this.services.relationships.deleteMemory(command.input, signal);
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
      case 'character-presentation-configure':
        await this.services.presentation.updateConfigurations([command.input], signal);
        return;
      case 'character-storyline-publish':
        await this.services.storylines.publish(command.input, signal);
        return;
      case 'character-storyline-run-create':
        await this.services.storylines.createRun(command.input, signal);
        return;
      case 'character-storyline-observation-propose':
        await this.services.storylines.proposeObservation(command.input, signal);
        return;
      case 'character-storyline-observation-accept':
        await this.services.storylines.acceptObservation(command.input, signal);
        return;
      case 'character-storyline-observation-reject':
        await this.services.storylines.rejectObservation(command.input, signal);
        return;
      case 'character-memory-scope-create':
        await this.services.memories.createScope(command.input, signal);
        return;
      case 'character-memory-candidate-propose':
        await this.services.memories.propose(command.input, signal);
        return;
      case 'character-memory-candidate-accept':
        await this.services.memories.accept(command.input, signal);
        return;
      case 'character-memory-candidate-reject':
        await this.services.memories.reject(command.input, signal);
        return;
      case 'character-memory-candidate-correct':
        await this.services.memories.correct(command.input, signal);
        return;
      case 'character-memory-entry-delete':
        await this.services.memories.delete(command.input, signal);
        return;
    }
  }
}
