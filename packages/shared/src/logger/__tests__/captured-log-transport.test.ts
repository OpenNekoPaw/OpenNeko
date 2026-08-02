import { describe, expect, it } from 'vitest';
import { CapturedLogTransport } from '../captured-log-transport';
import { ConsoleLogger } from '../console-logger';
import { LogLevel } from '../types';

describe('CapturedLogTransport', () => {
  it('captures structured entries from logger children', () => {
    const transport = new CapturedLogTransport();
    const logger = new ConsoleLogger('Agent', LogLevel.Debug, [transport]);

    logger.child('Executor').debug('execute.start', {
      trace: { conversationId: 'conv-1' },
      inputLength: 10,
    });

    expect(transport.list()).toHaveLength(1);
    expect(transport.findByMessage('execute.start')).toMatchObject({
      level: LogLevel.Debug,
      source: 'Agent:Executor',
      message: 'execute.start',
      data: {
        trace: { conversationId: 'conv-1' },
        inputLength: 10,
      },
    });
    expect(transport.filterBySource('Agent:Executor')).toHaveLength(1);
  });

  it('keeps captured payloads stable when caller mutates original objects', () => {
    const transport = new CapturedLogTransport();
    const logger = new ConsoleLogger('Agent', LogLevel.Debug, [transport]);
    const data = { nested: { value: 'before' } };

    logger.debug('payload', data);
    data.nested.value = 'after';

    expect(transport.findByMessage('payload')?.data).toEqual({
      nested: { value: 'before' },
    });
  });

  it('can clear captured entries', () => {
    const transport = new CapturedLogTransport();
    const logger = new ConsoleLogger('Agent', LogLevel.Debug, [transport]);

    logger.debug('one');
    transport.clear();

    expect(transport.list()).toHaveLength(0);
  });
});
