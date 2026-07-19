'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { assertFileSha256 } = require('./ffmpeg-artifact');

test('assertFileSha256 accepts archive bytes matching the configured digest', (t) => {
  const fixture = createFixture(t, 'verified ffmpeg archive');
  const sha256 = createHash('sha256').update('verified ffmpeg archive').digest('hex');

  assert.doesNotThrow(() => assertFileSha256(fixture, sha256));
});

test('assertFileSha256 rejects mismatched archive bytes before extraction', (t) => {
  const fixture = createFixture(t, 'unexpected archive bytes');
  const expected = createHash('sha256').update('expected archive bytes').digest('hex');
  const actual = createHash('sha256').update('unexpected archive bytes').digest('hex');

  assert.throws(
    () => assertFileSha256(fixture, expected),
    new RegExp(`FFmpeg archive checksum mismatch.*expected ${expected}.*actual ${actual}`, 'su'),
  );
});

function createFixture(t, contents) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-artifact-test-'));
  const fixture = path.join(fixtureDir, 'ffmpeg.zip');
  fs.writeFileSync(fixture, contents);
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  return fixture;
}
