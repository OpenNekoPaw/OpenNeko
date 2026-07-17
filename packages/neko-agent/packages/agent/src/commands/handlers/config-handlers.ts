/**
 * Configuration Command Handlers
 *
 * Handlers for: config, model, settings, permissions, init
 */

import type { CommandHandler } from '../types';

const CONFIG_KEYS = [
  'provider',
  'model',
  'maxTokens',
  'temperature',
  'verbose',
  'outputFormat',
] as const;

const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'openrouter'] as const;

/**
 * Handle /config command.
 */
export const handleConfig: CommandHandler = (args, context) => {
  const { config } = context;

  if (args.length === 0) {
    return {
      handled: true,
      continueExecution: true,
      semantic: {
        family: 'config',
        result: {
          kind: 'snapshot',
          config: {
            ...(config?.provider !== undefined ? { provider: config.provider } : {}),
            ...(config?.model !== undefined ? { model: config.model } : {}),
            ...(config?.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
            ...(config?.temperature !== undefined ? { temperature: config.temperature } : {}),
            verbose: config?.verbose ?? false,
            outputFormat: config?.outputFormat ?? 'text',
          },
        },
      },
    };
  }

  const subcommand = args[0]?.toLowerCase() ?? '';

  switch (subcommand) {
    case 'set': {
      const key = args[1];
      const value = args.slice(2).join(' ');

      if (!key || !value) {
        return {
          handled: true,
          continueExecution: true,
          semantic: {
            family: 'config',
            result: { kind: 'diagnostic', code: 'set-usage' },
          },
        };
      }

      if (!CONFIG_KEYS.includes(key as (typeof CONFIG_KEYS)[number])) {
        return {
          handled: true,
          continueExecution: true,
          semantic: {
            family: 'config',
            result: {
              kind: 'diagnostic',
              code: 'invalid-key',
              key,
              validKeys: CONFIG_KEYS,
            },
          },
        };
      }

      return {
        handled: true,
        continueExecution: true,
        data: { key, value },
        action: 'showSettings',
        semantic: {
          family: 'config',
          result: { kind: 'updated', key, value },
        },
      };
    }

    case 'providers':
      return {
        handled: true,
        continueExecution: true,
        semantic: {
          family: 'config',
          result: { kind: 'providers', providers: PROVIDERS },
        },
      };

    case 'models':
      return {
        handled: true,
        continueExecution: true,
        action: 'showModelSelector',
        semantic: {
          family: 'config',
          result: {
            kind: 'models',
            ...(config?.provider !== undefined ? { provider: config.provider } : {}),
          },
        },
      };

    default:
      return {
        handled: true,
        continueExecution: true,
        semantic: {
          family: 'config',
          result: { kind: 'diagnostic', code: 'unknown-subcommand', subcommand },
        },
      };
  }
};

/** Handle /model command (extension only). */
export const handleModel: CommandHandler = () => ({
  handled: true,
  continueExecution: true,
  action: 'showModelSelector',
});

/** Handle /settings command (extension only). */
export const handleSettings: CommandHandler = () => ({
  handled: true,
  continueExecution: true,
  action: 'showSettings',
});

/** Handle /permissions command (extension only). */
export const handlePermissions: CommandHandler = () => ({
  handled: true,
  continueExecution: true,
  action: 'showPermissions',
});

/** Handle /init command (extension only). */
export const handleInit: CommandHandler = () => ({
  handled: true,
  continueExecution: true,
  action: 'initProject',
});
