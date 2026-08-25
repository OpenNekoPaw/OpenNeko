import type { CharacterFoundationCommand } from '@neko/chara-domain/contracts';

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
      readonly companionContinuity: {
        propose(
          input: CommandInput<'companion-memory-candidate-propose'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        accept(
          input: CommandInput<'companion-memory-candidate-accept'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        reject(
          input: CommandInput<'companion-memory-candidate-reject'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        correct(
          input: CommandInput<'companion-memory-candidate-correct'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
        delete(
          input: CommandInput<'companion-memory-entry-delete'>,
          signal?: AbortSignal,
        ): Promise<unknown>;
      };
    },
  ) {}

  async execute(command: CharacterFoundationCommand, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    switch (command.operation) {
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
      case 'companion-memory-candidate-propose':
        await this.services.companionContinuity.propose(command.input, signal);
        return;
      case 'companion-memory-candidate-accept':
        await this.services.companionContinuity.accept(command.input, signal);
        return;
      case 'companion-memory-candidate-reject':
        await this.services.companionContinuity.reject(command.input, signal);
        return;
      case 'companion-memory-candidate-correct':
        await this.services.companionContinuity.correct(command.input, signal);
        return;
      case 'companion-memory-entry-delete':
        await this.services.companionContinuity.delete(command.input, signal);
        return;
    }
  }
}
