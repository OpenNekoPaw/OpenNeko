import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';

import { discoverWebviews } from './smoke-webview-builds.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

describe('first-level Webview smoke discovery', () => {
  it('discovers every retained first-level Webview build owner', () => {
    const webviews = discoverWebviews(repositoryRoot);

    assert.deepEqual(webviews.map((webview) => path.relative(repositoryRoot, webview.dir)).sort(), [
      'packages/neko-agent-webview',
      'packages/neko-assets-webview',
      'packages/neko-canvas-webview',
      'packages/neko-cut-webview',
      'packages/neko-preview-webview',
    ]);
  });

  it('filters by package identity without restoring nested discovery', () => {
    const webviews = discoverWebviews(repositoryRoot, new Set(['@neko-agent/webview']));

    assert.deepEqual(
      webviews.map((webview) => webview.name),
      ['@neko-agent/webview'],
    );
    assert.equal(webviews[0]?.dir.includes(`${path.sep}packages${path.sep}webview`), false);
  });
});
