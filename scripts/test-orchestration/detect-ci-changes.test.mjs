import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectCiChanges } from './detect-ci-changes.mjs';

describe('CI change detection', () => {
  it('detects nested source and package-level validation configuration', () => {
    assert.equal(detectCiChanges(['packages/neko-agent/packages/webview/src/App.tsx']).ts, true);
    assert.equal(
      detectCiChanges(['packages/neko-cut/packages/webview/vitest.config.ts']).ts,
      true,
    );
  });

  it('detects workflow, lockfile, quality, and root configuration inputs', () => {
    for (const path of [
      '.github/workflows/ci.yml',
      'pnpm-lock.yaml',
      'turbo.json',
      'quality/test-ownership.json',
      'eslint.config.mjs',
    ]) {
      assert.equal(detectCiChanges([path]).ts, true, path);
    }
  });

  it('detects Rust and Proto producers and generated consumers', () => {
    assert.deepEqual(detectCiChanges(['packages/neko-engine/crates/runtime/src/lib.rs']), {
      ts: false,
      rust: true,
      proto: false,
      openspec: false,
    });
    assert.equal(detectCiChanges(['packages/neko-proto/proto/neko.proto']).proto, true);
    assert.equal(
      detectCiChanges(['packages/neko-types/src/generated/neko.ts']).proto,
      true,
    );
  });

  it('does not invent affected domains for unrelated prose', () => {
    assert.deepEqual(detectCiChanges(['docs/research/note.md']), {
      ts: false,
      rust: false,
      proto: false,
      openspec: false,
    });
  });
});
