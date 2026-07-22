import { describe, expect, it } from 'vitest';
import {
  assertContentLocator,
  assertContentReadOptions,
  isAuthorizedOutputAllocationRequest,
  isAuthorizedWorkspaceWriteOptions,
  isContentProjectionOptions,
  isContentReadOptions,
  type AuthorizedWorkspaceWriteOptions,
  type ContentBytes,
  type ContentReadOptions,
  type EngineContentProjection,
  type ProcessorContentProjection,
  type WebviewContentProjection,
} from '../content-io';

const locator = {
  kind: 'workspace-file' as const,
  path: 'neko/assets/Books/comic.epub',
  fingerprint: { strategy: 'sha256' as const, value: 'sha256:comic-v1' },
};

describe('content I/O contracts', () => {
  it('accepts only bounded read and fingerprint precondition options', () => {
    expect(
      isContentReadOptions({
        range: { offset: 16, length: 32 },
        maxBytes: 64,
        expectedFingerprint: { strategy: 'sha256', value: 'sha256:comic-v1' },
      }),
    ).toBe(true);
    expect(isContentReadOptions({ range: { offset: -1, length: 32 } })).toBe(false);
    expect(isContentReadOptions({ range: { offset: 0, length: 0 } })).toBe(false);
    expect(isContentReadOptions({ maxBytes: 0 })).toBe(false);
  });

  it('poisons the old intent, target, cache, caller, and physical-path matrix', () => {
    const legacyOptions = [
      { intent: 'agent-context' },
      { target: 'local-path' },
      { materialization: 'if-missing' },
      { qualityMode: 'draft-proxy' },
      { caller: 'canvas' },
      { cachePath: '.neko/.cache/source.bin' },
      { localPath: '/Users/private/source.bin' },
      { providerId: 'cache-provider' },
    ];
    expect(legacyOptions.map(isContentReadOptions)).toEqual(legacyOptions.map(() => false));
    expect(() => assertContentLocator({ kind: 'media-library', libraryId: 'books' })).toThrow(
      'Content locator is invalid',
    );
    expect(() => assertContentReadOptions({ intent: 'verify' })).toThrow(
      'Content read options are invalid',
    );
  });

  it('keeps projection capabilities consumer-specific and opaque', () => {
    const webview: WebviewContentProjection = {
      status: 'ready',
      kind: 'webview',
      locator,
      uri: 'vscode-webview-resource://panel/content',
    };
    const engine: EngineContentProjection = {
      status: 'ready',
      kind: 'engine',
      locator,
      token: 'engine-source-token',
    };
    const processor: ProcessorContentProjection = {
      status: 'ready',
      kind: 'processor',
      locator,
      handle: 'processor-content-handle',
    };
    expect([webview.kind, engine.kind, processor.kind]).toEqual(['webview', 'engine', 'processor']);
    expect(isContentProjectionOptions({ expectedFingerprint: locator.fingerprint })).toBe(true);
    expect(isContentProjectionOptions({ target: 'local-path' })).toBe(false);
  });

  it('keeps writer authority instance-scoped instead of request-routed', () => {
    expect(
      isAuthorizedWorkspaceWriteOptions({
        conflict: 'replace',
        maxBytes: 1024,
        expectedFingerprint: locator.fingerprint,
      }),
    ).toBe(true);
    expect(
      isAuthorizedWorkspaceWriteOptions({
        conflict: 'replace',
        destination: { kind: 'media-library', allowAbsolutePath: true },
      }),
    ).toBe(false);
    expect(
      isAuthorizedOutputAllocationRequest({ fileNameHint: 'result', mediaType: 'image/png' }),
    ).toBe(true);
    expect(isAuthorizedOutputAllocationRequest({ destination: '/tmp/result.png' })).toBe(false);
  });
});

const compileTimeReadOptions: ContentReadOptions = {
  maxBytes: 1024,
  // @ts-expect-error New reads cannot select an intent or elevate caller capability.
  intent: 'agent-context',
};

const compileTimeBytes: ContentBytes = {
  status: 'ready',
  locator,
  bytes: new Uint8Array(),
  offset: 0,
  fingerprint: locator.fingerprint,
  // @ts-expect-error Public read results cannot expose Host physical paths.
  localPath: '/Users/private/source.bin',
};

const compileTimeWriteOptions: AuthorizedWorkspaceWriteOptions = {
  conflict: 'fail-if-exists',
  // @ts-expect-error Writer instances do not accept generic destination routing.
  destination: { kind: 'media-library' },
};

void compileTimeReadOptions;
void compileTimeBytes;
void compileTimeWriteOptions;
