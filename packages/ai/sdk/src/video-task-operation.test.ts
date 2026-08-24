import { describe, expect, it } from 'vitest';
import { createVideoTaskOperation, decodeVideoTaskOperation } from './video-task-operation';

describe('video task operation codec', () => {
  it('round-trips one exact provider task identity', () => {
    expect(decodeVideoTaskOperation(createVideoTaskOperation(' task-1 '))).toEqual({
      taskId: 'task-1',
    });
  });

  it('rejects missing and empty task identities', () => {
    expect(() => decodeVideoTaskOperation({})).toThrow('non-empty taskId');
    expect(() => createVideoTaskOperation('   ')).toThrow('non-empty taskId');
  });
});
