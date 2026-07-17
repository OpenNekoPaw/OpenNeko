import { describe, expect, it } from 'vitest';
import { createStrictTranslator } from '@neko/shared/i18n';
import {
  AGENT_COMMAND_MESSAGE_SOURCE,
  AGENT_COMMAND_MESSAGES_EN,
  AGENT_COMMAND_MESSAGES_ZH_CN,
} from '../terminal-messages';

describe('Agent command terminal messages', () => {
  it('keeps en and zh-cn key and placeholder contracts in parity', () => {
    expect(Object.keys(AGENT_COMMAND_MESSAGES_ZH_CN)).toEqual(
      Object.keys(AGENT_COMMAND_MESSAGES_EN),
    );
    expect(() => createStrictTranslator('zh-cn', [AGENT_COMMAND_MESSAGE_SOURCE])).not.toThrow();
  });
});
