import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleConfig,
  handleInit,
  handleModel,
  handlePermissions,
  handleSettings,
} from '../config-handlers';
import type { CommandContext, CommandResult } from '../../types';

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    config: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0.7,
      verbose: false,
      outputFormat: 'text',
    },
    ...overrides,
  };
}

async function run(
  handler: typeof handleConfig,
  args: string[],
  context: CommandContext,
): Promise<CommandResult> {
  return handler(args, context);
}

describe('configuration command handlers', () => {
  let context: CommandContext;

  beforeEach(() => {
    context = createContext();
  });

  it('returns a semantic configuration snapshot without final prose', async () => {
    const result = await run(handleConfig, [], context);

    expect(result).toMatchObject({
      handled: true,
      continueExecution: true,
      semantic: {
        family: 'config',
        result: {
          kind: 'snapshot',
          config: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            maxTokens: 4096,
            temperature: 0.7,
            verbose: false,
            outputFormat: 'text',
          },
        },
      },
    });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('error');
  });

  it('represents missing optional configuration values semantically', async () => {
    const result = await run(handleConfig, [], createContext({ config: undefined }));

    expect(result.semantic).toEqual({
      family: 'config',
      result: {
        kind: 'snapshot',
        config: { verbose: false, outputFormat: 'text' },
      },
    });
  });

  it('returns update data and semantics for valid keys', async () => {
    const result = await run(handleConfig, ['set', 'outputFormat', 'json pretty'], context);

    expect(result).toMatchObject({
      action: 'showSettings',
      data: { key: 'outputFormat', value: 'json pretty' },
      semantic: {
        family: 'config',
        result: { kind: 'updated', key: 'outputFormat', value: 'json pretty' },
      },
    });
  });

  it('returns typed diagnostics for invalid set input', async () => {
    await expect(run(handleConfig, ['set'], context)).resolves.toMatchObject({
      semantic: {
        family: 'config',
        result: { kind: 'diagnostic', code: 'set-usage' },
      },
    });

    await expect(run(handleConfig, ['set', 'invalidKey', 'value'], context)).resolves.toMatchObject(
      {
        semantic: {
          family: 'config',
          result: {
            kind: 'diagnostic',
            code: 'invalid-key',
            key: 'invalidKey',
          },
        },
      },
    );
  });

  it('returns provider and model semantics with stable external values', async () => {
    await expect(run(handleConfig, ['PROVIDERS'], context)).resolves.toMatchObject({
      semantic: {
        family: 'config',
        result: {
          kind: 'providers',
          providers: ['anthropic', 'openai', 'google', 'ollama', 'openrouter'],
        },
      },
    });

    await expect(run(handleConfig, ['models'], context)).resolves.toMatchObject({
      action: 'showModelSelector',
      semantic: {
        family: 'config',
        result: { kind: 'models', provider: 'anthropic' },
      },
    });
  });

  it('returns a typed unknown-subcommand diagnostic', async () => {
    await expect(run(handleConfig, ['unknown'], context)).resolves.toMatchObject({
      semantic: {
        family: 'config',
        result: { kind: 'diagnostic', code: 'unknown-subcommand', subcommand: 'unknown' },
      },
    });
  });

  it.each([
    [handleModel, 'showModelSelector'],
    [handleSettings, 'showSettings'],
    [handlePermissions, 'showPermissions'],
    [handleInit, 'initProject'],
  ] as const)('returns action-only results for extension-owned UI', async (handler, action) => {
    const result = await handler([], context);

    expect(result).toMatchObject({ handled: true, continueExecution: true, action });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('error');
  });
});
