import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ExecFileCallback = (
  error: Error | null,
  stdout: string | Buffer,
  stderr: string | Buffer,
) => void;

const { execFileMock, spawnMock, createWriteStreamMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
  createWriteStreamMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

vi.mock('fs', () => ({
  createWriteStream: createWriteStreamMock,
}));

import { GitCliGateway, type GitCliTarget } from './GitCliGateway';

const target: GitCliTarget = {
  cwd: '/repo',
  relativePath: 'media/video.mp4',
};

function createSpawnProcess(): EventEmitter & {
  stdout: { pipe: ReturnType<typeof vi.fn> };
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
} {
  const process = new EventEmitter() as EventEmitter & {
    stdout: { pipe: ReturnType<typeof vi.fn> };
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };

  process.stdout = { pipe: vi.fn() };
  process.stderr = new EventEmitter();
  process.kill = vi.fn();

  return process;
}

describe('GitCliGateway', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should read file content at a ref via git show', async () => {
    execFileMock.mockImplementation(
      (_command: string, _args: string[], _options: object, callback: ExecFileCallback) => {
        callback(null, Buffer.from('video-data'), Buffer.alloc(0));
      },
    );

    const gateway = new GitCliGateway();
    const result = await gateway.getFileAtCommit(target, 'HEAD');

    expect(result.equals(Buffer.from('video-data'))).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['show', 'HEAD:media/video.mp4'],
      expect.objectContaining({ cwd: '/repo', encoding: 'buffer' }),
      expect.any(Function),
    );
  });

  it('should detect tracked files via git ls-files', async () => {
    execFileMock.mockImplementation(
      (_command: string, _args: string[], _options: object, callback: ExecFileCallback) => {
        callback(null, 'media/video.mp4\n', '');
      },
    );

    const gateway = new GitCliGateway();

    await expect(gateway.isTracked(target)).resolves.toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['ls-files', '--error-unmatch', 'media/video.mp4'],
      expect.objectContaining({ cwd: '/repo', encoding: 'utf8' }),
      expect.any(Function),
    );
  });

  it('should parse file history from git log output', async () => {
    execFileMock.mockImplementation(
      (_command: string, _args: string[], _options: object, callback: ExecFileCallback) => {
        callback(
          null,
          'abcdef\x1fabc123\x1fUpdate frame sync\x1fNeko\x1f2026-04-12T01:02:03Z\x1e',
          '',
        );
      },
    );

    const gateway = new GitCliGateway();
    const history = await gateway.getFileHistory(target, 10);

    expect(history).toEqual([
      {
        hash: 'abcdef',
        shortHash: 'abc123',
        subject: 'Update frame sync',
        authorName: 'Neko',
        date: '2026-04-12T01:02:03Z',
      },
    ]);
  });

  it('should stream git show output directly to a file', async () => {
    const process = createSpawnProcess();
    const fileStream = new EventEmitter();

    spawnMock.mockReturnValue(process);
    createWriteStreamMock.mockReturnValue(fileStream);

    const gateway = new GitCliGateway();
    const extractPromise = gateway.extractFileToPath(target, 'HEAD', '/tmp/video.mp4');

    process.emit('close', 0);

    await expect(extractPromise).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['show', 'HEAD:media/video.mp4'],
      expect.objectContaining({ cwd: '/repo' }),
    );
    expect(process.stdout.pipe).toHaveBeenCalledWith(fileStream);
  });
});
