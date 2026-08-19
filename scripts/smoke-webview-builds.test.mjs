import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';

import { discoverWebviews } from './smoke-webview-builds.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

describe('first-level Webview smoke discovery', () => {
  it('discovers every retained first-level Webview build owner', () => {
    const webviews = discoverWebviews(repositoryRoot);

    assert.deepEqual(webviews.map((webview) => path.relative(repositoryRoot, webview.dir)).sort(), [
      'packages/assets/webview',
      'packages/canvas/webview',
      'packages/cut/webview',
      'packages/preview/webview',
      'packages/text-editor/webview',
    ]);
  });

  it('does not classify package-only browser presentation as standalone builds', () => {
    const webviews = discoverWebviews(repositoryRoot, new Set(['@neko/agent-webview']));

    assert.deepEqual(webviews, []);
  });
});
