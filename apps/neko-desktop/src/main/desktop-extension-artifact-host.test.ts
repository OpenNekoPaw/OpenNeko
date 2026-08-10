import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { AgentExtensionReviewedArtifact } from '@neko/agent-runtime/extensions';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDesktopExtensionArtifactHost,
  createExtensionArtifactSignatureMessage,
} from './desktop-extension-artifact-host';
import { DESKTOP_EXTENSION_MAX_EXPANDED_BYTES } from './desktop-extension-archive-policy';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop extension artifact Host', () => {
  it('streams, verifies, expands, validates, and atomically commits a reviewed artifact', async () => {
    const fixture = await createFixture();
    const receipt = await fixture.host.stage(fixture.stageInput);

    expect(receipt).toMatchObject({
      operationId: 'artifact-operation-1',
      pluginId: 'openneko.browser-use',
      finalUrl: 'https://artifacts.openneko.dev/browser-use.tar.gz',
      signatureVerified: true,
      sha256: fixture.artifact.sha256,
    });
    expect(fixture.stageInput.reportProgress).toHaveBeenLastCalledWith(fixture.artifact.sizeBytes);
    await expect(
      readFile(join(fixture.stagingRoot, 'runtime', 'bin', 'browser-use'), 'utf8'),
    ).resolves.toBe('#!/bin/sh\n');

    await fixture.host.commit({
      operationId: fixture.stageInput.operationId,
      stagingRoot: fixture.stagingRoot,
      targetRoot: fixture.targetRoot,
    });

    await expect(
      readFile(join(fixture.targetRoot, '.openneko-plugin', 'plugin.json'), 'utf8'),
    ).resolves.toBe('{}\n');
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('expands a reviewed ZIP artifact through the same contained provenance boundary', async () => {
    const fixture = await createFixture({ archiveKind: 'zip' });

    await expect(fixture.host.stage(fixture.stageInput)).resolves.toMatchObject({
      signatureVerified: true,
      sha256: fixture.artifact.sha256,
    });
    await expect(
      readFile(join(fixture.stagingRoot, 'runtime', 'bin', 'browser-use'), 'utf8'),
    ).resolves.toBe('#!/bin/sh\n');
    await fixture.host.discard(fixture.stageInput.operationId);
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects redirects outside the reviewed HTTPS hosts and removes operation staging', async () => {
    const fixture = await createFixture({
      request: vi.fn<typeof fetch>(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://evil.example/artifact.tar.gz' },
          }),
      ),
    });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'left the reviewed HTTPS hosts',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('follows only the exact reviewed HTTPS redirect chain', async () => {
    const fixture = await createFixture({
      allowedHosts: ['artifacts.openneko.dev', 'downloads.openneko.dev'],
      redirectChain: ['https://downloads.openneko.dev/releases/browser-use.tar.gz'],
    });

    await expect(fixture.host.stage(fixture.stageInput)).resolves.toMatchObject({
      finalUrl: 'https://downloads.openneko.dev/releases/browser-use.tar.gz',
    });
    expect(fixture.request).toHaveBeenNthCalledWith(
      1,
      'https://artifacts.openneko.dev/browser-use.tar.gz',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(fixture.request).toHaveBeenNthCalledWith(
      2,
      'https://downloads.openneko.dev/releases/browser-use.tar.gz',
      expect.objectContaining({ redirect: 'manual' }),
    );
    await fixture.host.discard(fixture.stageInput.operationId);
  });

  it('rejects a reviewed-host redirect chain beyond the bounded limit', async () => {
    const redirectChain = Array.from(
      { length: 6 },
      (_value, index) => `https://artifacts.openneko.dev/redirect-${String(index + 1)}`,
    );
    const fixture = await createFixture({ redirectChain });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'exceeded the redirect limit',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a mismatched Content-Length before writing unreviewed bytes', async () => {
    const fixture = await createFixture({ contentLengthOffset: 1 });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'Content-Length does not match',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a non-decimal Content-Length before writing unreviewed bytes', async () => {
    const fixture = await createFixture({ contentLength: '1e3' });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'Content-Length does not match',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    { name: 'strong ETag', header: 'etag', validator: '"artifact-etag-1"' },
    {
      name: 'Last-Modified',
      header: 'last-modified',
      validator: 'Mon, 10 Aug 2026 00:00:00 GMT',
    },
  ] as const)(
    'resumes the same artifact once with its exact $name validator and byte range',
    async ({ header, validator }) => {
      const transferredBytes = 256;
      const fixture = await createFixture({
        createRequest: (archive) => {
          let requestCount = 0;
          return vi.fn<typeof fetch>(async (_url, init) => {
            requestCount += 1;
            if (requestCount === 1) {
              return createInterruptedResponse(archive, transferredBytes, {
                'accept-ranges': 'bytes',
                [header]: validator,
              });
            }
            const headers = new Headers(init?.headers);
            expect(headers.get('range')).toBe(`bytes=${transferredBytes}-`);
            expect(headers.get('if-range')).toBe(validator);
            return new Response(new Uint8Array(archive.subarray(transferredBytes)), {
              status: 206,
              headers: {
                'content-length': String(archive.byteLength - transferredBytes),
                'content-range': `bytes ${transferredBytes}-${archive.byteLength - 1}/${archive.byteLength}`,
                [header]: validator,
              },
            });
          });
        },
      });

      await expect(fixture.host.stage(fixture.stageInput)).resolves.toMatchObject({
        sizeBytes: fixture.artifact.sizeBytes,
        sha256: fixture.artifact.sha256,
      });
      expect(fixture.request).toHaveBeenCalledTimes(2);
      expect(fixture.request).toHaveBeenNthCalledWith(
        2,
        fixture.artifact.url,
        expect.objectContaining({ redirect: 'manual' }),
      );
      expect(fixture.stageInput.reportProgress).toHaveBeenLastCalledWith(
        fixture.artifact.sizeBytes,
      );
      await fixture.host.discard(fixture.stageInput.operationId);
    },
  );

  it('rejects resume when the exact server validator changes', async () => {
    const transferredBytes = 256;
    const fixture = await createFixture({
      createRequest: (archive) => {
        let requestCount = 0;
        return vi.fn<typeof fetch>(async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return createInterruptedResponse(archive, transferredBytes, {
              'accept-ranges': 'bytes',
              etag: '"artifact-etag-1"',
            });
          }
          return new Response(new Uint8Array(archive.subarray(transferredBytes)), {
            status: 206,
            headers: {
              'content-length': String(archive.byteLength - transferredBytes),
              'content-range': `bytes ${transferredBytes}-${archive.byteLength - 1}/${archive.byteLength}`,
              etag: '"artifact-etag-2"',
            },
          });
        });
      },
    });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'resume validator changed',
    );
    expect(fixture.request).toHaveBeenCalledTimes(2);
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not resume a partial response without a server validator', async () => {
    const fixture = await createFixture({
      createRequest: (archive) =>
        vi.fn<typeof fetch>(async () =>
          createInterruptedResponse(archive, 256, { 'accept-ranges': 'bytes' }),
        ),
    });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'response body was interrupted',
    );
    expect(fixture.request).toHaveBeenCalledOnce();
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('bounds a second interrupted response without a third request', async () => {
    const firstTransferredBytes = 256;
    const secondTransferredBytes = 128;
    const validator = '"artifact-etag-1"';
    const fixture = await createFixture({
      createRequest: (archive) => {
        let requestCount = 0;
        return vi.fn<typeof fetch>(async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return createInterruptedResponse(archive, firstTransferredBytes, {
              'accept-ranges': 'bytes',
              etag: validator,
            });
          }
          return createInterruptedResponse(
            archive.subarray(firstTransferredBytes),
            secondTransferredBytes,
            {
              'content-range': `bytes ${firstTransferredBytes}-${archive.byteLength - 1}/${archive.byteLength}`,
              etag: validator,
            },
            206,
          );
        });
      },
    });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'response body was interrupted',
    );
    expect(fixture.request).toHaveBeenCalledTimes(2);
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cancels the exact in-flight request and removes its staging', async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason ?? new Error('Download aborted.')),
          { once: true },
        );
      });
      throw new Error('Cancelled fixture request unexpectedly continued.');
    });
    const fixture = await createFixture({ request });

    const staging = fixture.host.stage(fixture.stageInput);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    fixture.operationController.abort();

    await expect(staging).rejects.toMatchObject({ name: 'AbortError' });
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rechecks cancellation while expanding TAR entries and removes partial staging', async () => {
    const fixture = await createFixture();
    const signal = fixture.operationController.signal;
    const throwIfAborted = signal.throwIfAborted.bind(signal);
    let checks = 0;
    vi.spyOn(signal, 'throwIfAborted').mockImplementation(() => {
      checks += 1;
      if (checks === 5) fixture.operationController.abort();
      throwIfAborted();
    });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(checks).toBeGreaterThanOrEqual(5);
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    {
      name: 'parent traversal',
      entries: [{ path: '../escape', content: 'poison' }],
      error: 'path is unsafe',
    },
    {
      name: 'case collision',
      entries: [
        { path: 'Runtime/tool', content: 'one' },
        { path: 'runtime/tool', content: 'two' },
      ],
      error: 'duplicate or case-colliding path',
    },
    {
      name: 'symbolic link',
      entries: [{ path: 'runtime-link', content: '', type: '2' }],
      error: 'link or unsupported entry type',
    },
  ])('rejects $name archive poison without leaving partial files', async ({ entries, error }) => {
    const fixture = await createFixture({ extraEntries: entries });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(error);
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a TAR entry whose declared expansion exceeds the production byte limit', async () => {
    const fixture = await createFixture({
      extraEntries: [
        {
          path: 'runtime/oversized-payload',
          content: '',
          declaredSize: DESKTOP_EXTENSION_MAX_EXPANDED_BYTES + 1,
        },
      ],
    });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'expanded size exceeds its limit',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a TAR entry whose declared content is truncated', async () => {
    const fixture = await createFixture({
      extraEntries: [
        {
          path: 'runtime/truncated-payload',
          content: '',
          declaredSize: 2_048,
        },
      ],
    });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'entry content is truncated',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an untrusted signature identity before exposing a staged artifact', async () => {
    const fixture = await createFixture({ trustedKeyId: 'openneko-release-other' });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      "signature key 'openneko-release-2026' is untrusted",
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects modified archive bytes before expansion', async () => {
    const fixture = await createFixture({ modifyResponseBytes: true });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'size or digest does not match',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects contained provenance that disagrees with the reviewed catalog', async () => {
    const fixture = await createFixture({ containedSourceCommit: 'different-commit' });

    await expect(fixture.host.stage(fixture.stageInput)).rejects.toThrow(
      'contained provenance does not match',
    );
    await expect(access(fixture.stagingRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

interface TarEntry {
  readonly path: string;
  readonly content: string;
  readonly type?: string;
  readonly mode?: number;
  readonly declaredSize?: number;
}

async function createFixture(
  options: {
    readonly request?: typeof fetch;
    readonly extraEntries?: readonly TarEntry[];
    readonly trustedKeyId?: string;
    readonly containedSourceCommit?: string;
    readonly modifyResponseBytes?: boolean;
    readonly archiveKind?: 'tar.gz' | 'zip';
    readonly allowedHosts?: readonly string[];
    readonly redirectChain?: readonly string[];
    readonly contentLengthOffset?: number;
    readonly contentLength?: string;
    readonly createRequest?: (archive: Buffer) => typeof fetch;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'neko-extension-artifact-'));
  roots.push(root);
  const installRoot = join(root, 'extensions');
  const stagingRoot = join(installRoot, '.artifact-operation-1');
  const targetRoot = join(installRoot, 'browser-use');
  await mkdir(installRoot, { recursive: true });

  const licenseContent = '{"packages":[]}\n';
  const licenseInventory = {
    path: 'THIRD_PARTY_LICENSES.spdx.json',
    sha256: digest(Buffer.from(licenseContent)),
  } as const;
  const sourceCommit = '0123456789abcdef0123456789abcdef01234567';
  const provenance = {
    sourceRepository: 'https://github.com/browser-use/browser-use',
    sourceCommit,
    buildRecipeSha256: `sha256:${'a'.repeat(64)}`,
  } as const;
  const archiveEntries = [
    { path: '.openneko-plugin/plugin.json', content: '{}\n' },
    {
      path: '.openneko-plugin/artifact-provenance.json',
      content: `${JSON.stringify({
        sourceRepository: provenance.sourceRepository,
        sourceCommit: options.containedSourceCommit ?? provenance.sourceCommit,
        buildRecipeSha256: provenance.buildRecipeSha256,
        licenseInventory,
      })}\n`,
    },
    { path: licenseInventory.path, content: licenseContent },
    { path: 'runtime/bin/browser-use', content: '#!/bin/sh\n', mode: 0o755 },
    ...(options.extraEntries ?? []),
  ];
  const archive =
    options.archiveKind === 'zip' ? await createZip(archiveEntries) : createTarGzip(archiveEntries);
  const unsignedArtifact = {
    deliverySource: 'official-download',
    platform: { os: process.platform, arch: process.arch },
    archive: options.archiveKind ?? 'tar.gz',
    url: 'https://artifacts.openneko.dev/browser-use.tar.gz',
    allowedHosts: options.allowedHosts ?? ['artifacts.openneko.dev'],
    sizeBytes: archive.byteLength,
    sha256: digest(archive),
    provenance,
    licenseInventory,
  } as const;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const artifact: AgentExtensionReviewedArtifact = {
    ...unsignedArtifact,
    signature: {
      algorithm: 'ed25519',
      keyId: 'openneko-release-2026',
      value: sign(
        null,
        createExtensionArtifactSignatureMessage(unsignedArtifact),
        privateKey,
      ).toString('base64'),
    },
  };
  const pendingRedirects = [...(options.redirectChain ?? [])];
  const request =
    options.request ??
    options.createRequest?.(archive) ??
    vi.fn<typeof fetch>(async () => {
      const redirect = pendingRedirects.shift();
      if (redirect) {
        return new Response(null, { status: 302, headers: { location: redirect } });
      }
      const responseBytes = Buffer.from(archive);
      if (options.modifyResponseBytes) responseBytes[0] = (responseBytes[0] ?? 0) ^ 0xff;
      return new Response(new Uint8Array(responseBytes), {
        status: 200,
        headers: {
          'content-length':
            options.contentLength ??
            String(responseBytes.byteLength + (options.contentLengthOffset ?? 0)),
        },
      });
    });
  const trustedKeyId = options.trustedKeyId ?? artifact.signature.keyId;
  const host = createDesktopExtensionArtifactHost({
    platform: artifact.platform,
    trustedKeys: new Map([[trustedKeyId, publicKey]]),
    request,
  });
  const operationController = new AbortController();
  return {
    artifact,
    host,
    request,
    operationController,
    stagingRoot,
    targetRoot,
    stageInput: {
      operationId: 'artifact-operation-1',
      pluginId: 'openneko.browser-use',
      packageRelease: '0.13.7',
      artifact,
      installRoot,
      stagingRoot,
      signal: operationController.signal,
      reportProgress: vi.fn(),
    },
  };
}

function createInterruptedResponse(
  content: Buffer,
  transferredBytes: number,
  headers: Readonly<Record<string, string>>,
  status = 200,
): Response {
  let delivered = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!delivered) {
        delivered = true;
        controller.enqueue(new Uint8Array(content.subarray(0, transferredBytes)));
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      controller.error(new Error('Fixture connection reset.'));
    },
  });
  return new Response(body, {
    status,
    headers: {
      'content-length': String(content.byteLength),
      ...headers,
    },
  });
}

async function createZip(entries: readonly TarEntry[]): Promise<Buffer> {
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output);
  for (const entry of entries) {
    if (entry.type !== undefined && entry.type !== '0') {
      throw new Error('ZIP fixture supports regular files only.');
    }
    await writer.add(entry.path, new TextReader(entry.content), {
      executable: (entry.mode ?? 0) === 0o755,
    });
  }
  return Buffer.from(await writer.close());
}

function createTarGzip(entries: readonly TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content);
    const header = Buffer.alloc(512);
    writeText(header, 0, 100, entry.path);
    writeOctal(header, 100, 8, entry.mode ?? 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, entry.declaredSize ?? content.byteLength);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = (entry.type ?? '0').charCodeAt(0);
    writeText(header, 257, 6, 'ustar');
    writeText(header, 263, 2, '00');
    const checksum = header.reduce((sum, value) => sum + value, 0);
    const checksumText = checksum.toString(8).padStart(6, '0');
    header.write(checksumText, 148, 6, 'ascii');
    header[154] = 0;
    header[155] = 0x20;
    blocks.push(header, content);
    const padding = (512 - (content.byteLength % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function writeText(buffer: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length) throw new Error(`TAR fixture field '${value}' is too long.`);
  bytes.copy(buffer, offset);
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const text = value.toString(8).padStart(length - 1, '0');
  buffer.write(text, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

function digest(content: Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
