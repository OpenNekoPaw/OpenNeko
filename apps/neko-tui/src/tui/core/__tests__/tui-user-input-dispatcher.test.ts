import { describe, expect, it, vi } from 'vitest';
import { dispatchTuiUserInput } from '../tui-user-input-dispatcher';

describe('dispatchTuiUserInput', () => {
  it.each(['$creation-persona write a draft', '/status'])(
    'routes control input through the TUI command boundary: %s',
    async (input) => {
      const submitPrompt = vi.fn(async () => undefined);
      const handleControlInput = vi.fn(async () => undefined);

      await dispatchTuiUserInput(input, { submitPrompt, handleControlInput });

      expect(handleControlInput).toHaveBeenCalledWith(input);
      expect(submitPrompt).not.toHaveBeenCalled();
    },
  );

  it('submits ordinary prompts through the session input path', async () => {
    const submitPrompt = vi.fn(async () => undefined);
    const handleControlInput = vi.fn(async () => undefined);

    await dispatchTuiUserInput('Create a two-shot draft.', {
      submitPrompt,
      handleControlInput,
    });

    expect(submitPrompt).toHaveBeenCalledWith('Create a two-shot draft.');
    expect(handleControlInput).not.toHaveBeenCalled();
  });
});
