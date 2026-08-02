import { describe, expect, it } from 'vitest';
import { CapturedLogTransport } from '../captured-log-transport';
import { ConsoleLogger } from '../console-logger';
import { createLoggerRegistry, createWebviewLoggerRegistry, LogLevel } from '../index';

describe('Webview logger registries', () => {
  it('creates child loggers from a package root', () => {
    const transport = new CapturedLogTransport();
    const registry = createWebviewLoggerRegistry({
      packageName: 'NekoPreview',
      defaultLevel: LogLevel.Debug,
      rootLogger: new ConsoleLogger('NekoPreview', LogLevel.Debug, [transport]),
    });

    registry.getLogger('VideoPlayer').debug('stream.start', { id: 'stream-1' });

    expect(transport.findByMessage('stream.start')).toMatchObject({
      source: 'NekoPreview:VideoPlayer',
      level: LogLevel.Debug,
      data: { id: 'stream-1' },
    });
  });

  it('lets tests replace the root logger without changing component code', () => {
    const firstTransport = new CapturedLogTransport();
    const secondTransport = new CapturedLogTransport();
    const registry = createLoggerRegistry('NekoCanvas', LogLevel.Debug);

    registry.setRootLogger(new ConsoleLogger('TestCanvas', LogLevel.Debug, [firstTransport]));
    registry.getLogger('InlineVideo').info('before.replace');
    registry.setRootLogger(new ConsoleLogger('InjectedCanvas', LogLevel.Debug, [secondTransport]));
    registry.getLogger('InlineVideo').info('after.replace');

    expect(firstTransport.findByMessage('before.replace')?.source).toBe('TestCanvas:InlineVideo');
    expect(secondTransport.findByMessage('after.replace')?.source).toBe(
      'InjectedCanvas:InlineVideo',
    );
  });

  it('routes existing child loggers through the latest root logger', () => {
    const initialTransport = new CapturedLogTransport();
    const injectedTransport = new CapturedLogTransport();
    const registry = createLoggerRegistry('NekoAgent', LogLevel.Debug);
    const logger = registry.getLogger('AgentSession');

    registry.setRootLogger(new ConsoleLogger('BeforeInject', LogLevel.Debug, [initialTransport]));
    logger.debug('before.inject');
    registry.setRootLogger(new ConsoleLogger('AfterInject', LogLevel.Debug, [injectedTransport]));
    logger.debug('after.inject');

    expect(initialTransport.findByMessage('before.inject')?.source).toBe(
      'BeforeInject:AgentSession',
    );
    expect(initialTransport.findByMessage('after.inject')).toBeUndefined();
    expect(injectedTransport.findByMessage('after.inject')?.source).toBe(
      'AfterInject:AgentSession',
    );
  });

  it('routes nested child loggers through the latest root logger', () => {
    const transport = new CapturedLogTransport();
    const registry = createLoggerRegistry('NekoAgent', LogLevel.Debug);
    const logger = registry.getLogger('AgentSession').child('Executor');

    registry.setRootLogger(new ConsoleLogger('InjectedAgent', LogLevel.Debug, [transport]));
    logger.info('nested.child');

    expect(transport.findByMessage('nested.child')?.source).toBe(
      'InjectedAgent:AgentSession:Executor',
    );
  });

  it('propagates root ConsoleLogger level changes through registry children', () => {
    const transport = new CapturedLogTransport();
    const registry = createLoggerRegistry('NekoAudio', LogLevel.Debug);
    const root = new ConsoleLogger('NekoAudio', LogLevel.Debug, [transport]);
    registry.setRootLogger(root);

    const logger = registry.getLogger('TransportBar');
    root.setLevel(LogLevel.Warn);
    logger.info('hidden');
    logger.warn('visible');

    expect(transport.findByMessage('hidden')).toBeUndefined();
    expect(transport.findByMessage('visible')?.source).toBe('NekoAudio:TransportBar');
  });

  it('rejects setting a registry proxy as its own root logger', () => {
    const registry = createLoggerRegistry('NekoAgent', LogLevel.Debug);

    expect(() => registry.setRootLogger(registry.getRootLogger())).toThrow(
      'Logger registry root cannot be set to one of its own proxy loggers.',
    );
  });
});
