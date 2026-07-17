import { isSkillInvocation, isSlashCommand } from './slash-commands';

export interface TuiUserInputDispatcher {
  readonly submitPrompt: (input: string) => Promise<void>;
  readonly handleControlInput: (input: string) => Promise<void>;
}

export async function dispatchTuiUserInput(
  input: string,
  dispatcher: TuiUserInputDispatcher,
): Promise<void> {
  if (isSlashCommand(input) || isSkillInvocation(input)) {
    await dispatcher.handleControlInput(input);
    return;
  }
  await dispatcher.submitPrompt(input);
}
