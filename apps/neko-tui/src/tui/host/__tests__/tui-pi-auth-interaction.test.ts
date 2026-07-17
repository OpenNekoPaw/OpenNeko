import { describe, expect, it, vi } from 'vitest';

import { TuiPiAuthInteraction } from '../tui-pi-auth-interaction';

describe('TuiPiAuthInteraction', () => {
  it('delegates Pi prompts to terminal-owned input and preserves selected ids', async () => {
    const port = {
      text: vi.fn().mockResolvedValue('secret'),
      select: vi.fn().mockResolvedValue('browser'),
      notify: vi.fn(),
    };
    const interaction = new TuiPiAuthInteraction(port);

    await expect(
      interaction.prompt({ type: 'secret', message: 'API key', placeholder: 'key' }),
    ).resolves.toBe('secret');
    await expect(
      interaction.prompt({
        type: 'select',
        message: 'Login method',
        options: [{ id: 'browser', label: 'Browser' }],
      }),
    ).resolves.toBe('browser');

    expect(port.text).toHaveBeenCalledWith({
      message: 'API key',
      placeholder: 'key',
      secret: true,
    });
    expect(port.select).toHaveBeenCalledWith({
      message: 'Login method',
      options: [{ id: 'browser', label: 'Browser' }],
    });
  });

  it('fails visibly when the terminal cancels or the Pi prompt aborts', async () => {
    const port = {
      text: vi.fn().mockResolvedValue(null),
      select: vi.fn().mockResolvedValue(null),
      notify: vi.fn(),
    };
    const interaction = new TuiPiAuthInteraction(port);
    const controller = new AbortController();
    controller.abort();

    await expect(interaction.prompt({ type: 'text', message: 'Account' })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(
      interaction.prompt({ type: 'manual_code', message: 'Code', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('forwards non-secret Pi auth events to terminal presentation', () => {
    const port = {
      text: vi.fn(),
      select: vi.fn(),
      notify: vi.fn(),
    };
    const interaction = new TuiPiAuthInteraction(port);
    const event = { type: 'progress' as const, message: 'Waiting for provider' };

    interaction.notify(event);

    expect(port.notify).toHaveBeenCalledWith(event);
  });
});
