import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  installVerifiedMediaRuntimePaths,
  resolveMediaRuntimeTarget,
} from './media-host-contract.ts';

describe('OpenNeko media composition', () => {
  it('maps only supported packaged targets', () => {
    assert.equal(resolveMediaRuntimeTarget('darwin', 'arm64'), 'darwin-arm64');
    assert.equal(resolveMediaRuntimeTarget('linux', 'x64'), 'linux-x64');
    assert.throws(() => resolveMediaRuntimeTarget('darwin', 'x64'), /does not support/u);
  });

  it('overrides inherited discovery paths with the verified packaged paths', () => {
    const environment: NodeJS.ProcessEnv = {
      NEKO_FFMPEG_PATH: '/inherited/ffmpeg',
      NEKO_FFPROBE_PATH: '/inherited/ffprobe',
    };
    installVerifiedMediaRuntimePaths(environment, {
      ffmpeg: '/runtime/bin/ffmpeg',
      ffprobe: '/runtime/bin/ffprobe',
    });
    assert.deepEqual(environment, {
      NEKO_FFMPEG_PATH: '/runtime/bin/ffmpeg',
      NEKO_FFPROBE_PATH: '/runtime/bin/ffprobe',
    });
  });
});
