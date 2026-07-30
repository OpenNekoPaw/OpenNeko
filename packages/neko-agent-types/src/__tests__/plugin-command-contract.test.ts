import { describe, expect, it } from 'vitest';
import { buildPluginSlashCommandId } from '../plugin-command-contract';

describe('plugin command contract', () => {
  it('builds a Desktop plugin slash command id from the canonical plugin identity', () => {
    expect(
      buildPluginSlashCommandId({
        pluginId: 'neko.canvas',
        commandId: 'batch',
      }),
    ).toBe('neko.canvas.slashCommand.batch');
  });
});
