import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeDocumentPreviewServer, type DocumentPreviewFormat } from './NodeDocumentPreviewServer';

describe('NodeDocumentPreviewServer', () => {
  const tempDirs: string[] = [];
  const servers: NodeDocumentPreviewServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.dispose()));
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it.each([
    ['pdf', 'application/pdf'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['cbz', 'application/vnd.comicbook+zip'],
  ] satisfies ReadonlyArray<readonly [Exclude<DocumentPreviewFormat, 'epub'>, string]>)(
    'serves %s through a tokenized Node loopback URL with its MIME type',
    async (format, expectedMime) => {
      const filePath = await createDocumentFixture(`${format}-bytes`);
      const server = createServer();

      const registration = await server.register(filePath, format);
      const response = await fetch(registration.url);

      expect(registration.url).toMatch(
        /^http:\/\/127\.0\.0\.1:\d+\/v1\/document-preview\/file\/[0-9a-f-]+$/,
      );
      expect(registration.url).not.toContain(encodeURIComponent(filePath));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(expectedMime);
      expect(response.headers.get('accept-ranges')).toBe('bytes');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(await response.text()).toBe(`${format}-bytes`);
    },
  );

  it('supports HEAD plus closed, open-ended, and suffix byte ranges', async () => {
    const filePath = await createDocumentFixture('0123456789');
    const server = createServer();
    const registration = await server.register(filePath, 'pdf');

    const head = await fetch(registration.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
    expect((await head.arrayBuffer()).byteLength).toBe(0);

    await expectRange(registration.url, 'bytes=2-5', '2345', 'bytes 2-5/10');
    await expectRange(registration.url, 'bytes=7-', '789', 'bytes 7-9/10');
    await expectRange(registration.url, 'bytes=-3', '789', 'bytes 7-9/10');
  });

  it('rejects a DOCX that exceeds the bounded whole-file response limit', async () => {
    const filePath = await createDocumentFixture('oversized-docx');
    const server = createServer({ maxWholeFileBytes: 4 });

    await expect(server.register(filePath, 'docx')).rejects.toThrow('4-byte whole-file limit');
  });

  it.each(['bytes=20-30', 'bytes=5-2', 'bytes=0-1,4-5', 'items=0-1'])(
    'rejects the invalid range %s without streaming the file',
    async (range) => {
      const filePath = await createDocumentFixture('0123456789');
      const server = createServer();
      const registration = await server.register(filePath, 'cbz');

      const response = await fetch(registration.url, { headers: { Range: range } });

      expect(response.status).toBe(416);
      expect(response.headers.get('content-range')).toBe('bytes */10');
      expect((await response.arrayBuffer()).byteLength).toBe(0);
    },
  );

  it('answers Webview private-network preflight without returning document bytes', async () => {
    const filePath = await createDocumentFixture('pdf-bytes');
    const server = createServer();
    const registration = await server.register(filePath, 'pdf');

    const response = await fetch(registration.url, {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Private-Network': 'true' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    expect(response.headers.get('access-control-allow-headers')).toContain('Range');
    expect(response.headers.get('access-control-allow-private-network')).toBe('true');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it('rejects unknown and revoked tokens and stops listening on disposal', async () => {
    const filePath = await createDocumentFixture('pdf-bytes');
    const server = createServer();
    const registration = await server.register(filePath, 'pdf');
    const unknownUrl = registration.url.replace(registration.token, crypto.randomUUID());

    expect((await fetch(unknownUrl)).status).toBe(404);
    await server.unregister(registration.token);
    expect((await fetch(registration.url)).status).toBe(404);

    const active = await server.register(filePath, 'pdf');
    await server.dispose();
    await expect(fetch(active.url)).rejects.toThrow();
  });

  it('serves EPUB as directory-style archive entries with entry MIME types', async () => {
    const entries = new Map<string, Uint8Array>([
      ['META-INF/container.xml', bytes('<container/>')],
      ['OPS/package.opf', bytes('<package/>')],
      ['OPS/chapter.xhtml', bytes('<html/>')],
      ['OPS/book.css', bytes('body {}')],
      ['OPS/font.woff2', bytes('font')],
      ['OPS/cover.png', new Uint8Array([137, 80, 78, 71])],
    ]);
    const readEntry = vi.fn(async (_filePath: string, entryPath: string) => {
      const entry = entries.get(entryPath);
      if (!entry) throw new Error(`Document archive entry does not exist: ${entryPath}`);
      return entry;
    });
    const filePath = await createDocumentFixture('epub-placeholder');
    const server = createServer({ documentAccess: { readEntry } });

    const registration = await server.register(filePath, 'epub');

    expect(registration.url).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/v1\/document-preview\/epub\/[0-9a-f-]+\/$/,
    );
    await expectEntry(registration.url, 'META-INF/container.xml', 'application/xml');
    await expectEntry(registration.url, 'OPS/package.opf', 'application/oebps-package+xml');
    await expectEntry(registration.url, 'OPS/chapter.xhtml', 'application/xhtml+xml');
    await expectEntry(registration.url, 'OPS/book.css', 'text/css; charset=utf-8');
    await expectEntry(registration.url, 'OPS/font.woff2', 'font/woff2');
    await expectEntry(registration.url, 'OPS/cover.png', 'image/png');
    expect(readEntry).toHaveBeenCalledWith(filePath, 'META-INF/container.xml');
  });

  it.each(['missing.xhtml', '%2e%2e%2fsecret', '%2Fetc%2Fpasswd', 'bad%00name'])(
    'rejects missing or unsafe EPUB entry %s without exposing another file',
    async (entryPath) => {
      const readEntry = vi.fn(async (_filePath: string, normalizedPath: string) => {
        if (
          normalizedPath.includes('..') ||
          normalizedPath.startsWith('/') ||
          normalizedPath.includes('\0')
        ) {
          throw new Error(`Document archive entry is invalid: ${normalizedPath}`);
        }
        throw new Error(`Document archive entry does not exist: ${normalizedPath}`);
      });
      const filePath = await createDocumentFixture('epub-placeholder');
      const server = createServer({ documentAccess: { readEntry } });
      const registration = await server.register(filePath, 'epub');

      const response = await fetch(`${registration.url}${entryPath}`);

      expect([400, 404]).toContain(response.status);
      expect(await response.text()).not.toContain(filePath);
    },
  );

  it.each(['ENOENT', 'ENOTDIR'])(
    'maps linked EPUB source loss (%s) to a safe not-found response',
    async (code) => {
      const filePath = await createDocumentFixture('epub-placeholder');
      const readEntry = vi.fn(async () => {
        throw Object.assign(new Error(`source disappeared: ${filePath}`), { code });
      });
      const server = createServer({ documentAccess: { readEntry } });
      const registration = await server.register(filePath, 'epub');

      const response = await fetch(`${registration.url}OPS/chapter.xhtml`);

      expect(response.status).toBe(404);
      const body = await response.text();
      expect(body).toBe('document file not found');
      expect(body).not.toContain(filePath);
    },
  );

  function createServer(
    options: ConstructorParameters<typeof NodeDocumentPreviewServer>[0] = {},
  ): NodeDocumentPreviewServer {
    const server = new NodeDocumentPreviewServer(options);
    servers.push(server);
    return server;
  }

  async function createDocumentFixture(content: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'neko-preview-node-server-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'document.bin');
    await writeFile(filePath, content);
    return filePath;
  }
});

async function expectRange(
  url: string,
  range: string,
  expectedBody: string,
  expectedContentRange: string,
): Promise<void> {
  const response = await fetch(url, { headers: { Range: range } });
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe(expectedContentRange);
  expect(response.headers.get('content-length')).toBe(String(expectedBody.length));
  expect(await response.text()).toBe(expectedBody);
}

async function expectEntry(url: string, entryPath: string, expectedMime: string): Promise<void> {
  const response = await fetch(`${url}${entryPath}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe(expectedMime);
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
