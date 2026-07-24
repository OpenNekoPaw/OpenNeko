import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

const {
  executeCommand,
  showWarningMessage,
  workspaceFolders,
  readFile,
  getExtension,
  existingFiles,
} = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  showWarningMessage: vi.fn(),
  workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
  readFile: vi.fn(),
  getExtension: vi.fn(),
  existingFiles: new Set<string>(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const statSync = vi.fn((filePath: string) => {
    if (existingFiles.has(filePath)) {
      return {
        isFile: () => true,
        isDirectory: () => false,
      };
    }
    return actual.statSync(filePath);
  });
  return {
    ...actual,
    default: { ...actual, statSync },
    statSync,
  };
});

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ scheme: 'file', fsPath: p, path: p }),
    joinPath: (base: { path: string }, ...s: string[]) => ({
      scheme: 'file',
      fsPath: [base.path, ...s].join('/'),
      path: [base.path, ...s].join('/'),
    }),
  },
  commands: { executeCommand },
  window: { showWarningMessage },
  workspace: { workspaceFolders },
  extensions: { getExtension },
  env: { language: 'en' },
  EventEmitter: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    default: { ...actual, readFile },
    readFile,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: { ...actual, homedir: () => '/Users/tester' },
    homedir: () => '/Users/tester',
  };
});

vi.mock('../../utils/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  getErrorHtml,
  getUnresolvedVariableHtml,
  setupDocumentWebview,
} from '../providers/document/documentProviderHelper';
import {
  previewFileServer,
  UnresolvedPathVariableError,
} from '../providers/document/PreviewFileServer';
import { resolvePreviewPath } from '../providers/document/workspacePathResolver';
import { PdfPreviewProvider } from '../providers/document/PdfPreviewProvider';

beforeEach(() => {
  executeCommand.mockReset();
  showWarningMessage.mockReset();
  readFile.mockReset();
  getExtension.mockReset();
  getExtension.mockReturnValue(undefined);
  existingFiles.clear();
  workspaceFolders.length = 0;
});

describe('document preview to Agent context bridge', () => {
  it('enriches document selections with source locator and excerpt metadata', async () => {
    let messageHandler: ((message: unknown) => Promise<void>) | undefined;
    const panel = {
      webview: {
        options: {},
        html: '',
        asWebviewUri: (uri: unknown) => uri,
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        }),
      },
      onDidDispose: vi.fn(),
    };

    await setupDocumentWebview(
      { uri: { fsPath: '/docs/book.epub', toString: () => 'file:///docs/book.epub' } } as never,
      panel as never,
      { path: '/extension' } as never,
      'epub',
    );

    await messageHandler?.({
      type: 'document:sendToAi',
      payload: {
        text: 'Selected text',
        contentKind: 'text',
        context: { chapter: 'Chapter 1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
      },
    });

    expect(executeCommand).toHaveBeenCalledWith(
      'neko.agent.sendContext',
      expect.objectContaining({
        type: 'document-selection',
        data: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '/docs/book.epub',
            format: 'epub',
          }),
          locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
          excerpt: expect.objectContaining({ text: 'Selected text', contentKind: 'text' }),
        }),
      }),
    );
  });

  it('handles duplicate Webview ready messages only once', async () => {
    let messageHandler: ((message: unknown) => Promise<void>) | undefined;
    const onReady = vi.fn(async () => undefined);
    const panel = {
      webview: {
        options: {},
        html: '',
        asWebviewUri: (uri: unknown) => uri,
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        }),
      },
      onDidDispose: vi.fn(),
    };

    await setupDocumentWebview(
      { uri: { fsPath: '/docs/book.pdf', toString: () => 'file:///docs/book.pdf' } } as never,
      panel as never,
      { path: '/extension' } as never,
      'pdf',
      { onReady },
    );

    await messageHandler?.({ type: 'ready' });
    await messageHandler?.({ type: 'ready' });

    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

describe('document provider registration lifetime', () => {
  it('projects original PDF source through the Node transport without returning a derived path', async () => {
    const registerFile = vi.spyOn(previewFileServer, 'registerFile').mockResolvedValueOnce({
      url: 'http://127.0.0.1:4000/source-token',
      token: 'source-token',
    });
    const unregisterFile = vi
      .spyOn(previewFileServer, 'unregisterFile')
      .mockResolvedValue(undefined);
    const provider = new PdfPreviewProvider({ path: '/extension' } as never);
    const panel = createDocumentPanel();
    const document = {
      uri: { fsPath: '/docs/book.pdf', toString: () => 'file:///docs/book.pdf' },
    } as never;

    await provider.resolveCustomEditor(document, panel.panel as never, {} as never);
    await panel.send({ type: 'ready' });

    expect(registerFile).toHaveBeenCalledWith('/docs/book.pdf', {
      sourceDocumentUri: document.uri,
    });
    expect(
      (panel.panel['webview'] as { postMessage: ReturnType<typeof vi.fn> }).postMessage,
    ).toHaveBeenCalledWith({
      type: 'document:data',
      payload: { url: 'http://127.0.0.1:4000/source-token' },
    });
    const messages = JSON.stringify(
      (panel.panel['webview'] as { postMessage: ReturnType<typeof vi.fn> }).postMessage.mock.calls,
    );
    expect(messages).not.toContain('.neko/.cache');
    expect(messages).not.toContain('representationLocator');

    provider.dispose();
    await vi.waitFor(() => expect(unregisterFile).toHaveBeenCalledWith('source-token'));
    registerFile.mockRestore();
    unregisterFile.mockRestore();
  });

  it('keeps tokens panel-scoped when the same document is reopened', async () => {
    const registerFile = vi
      .spyOn(previewFileServer, 'registerFile')
      .mockResolvedValueOnce({ url: 'http://127.0.0.1:4000/old', token: 'old-token' })
      .mockResolvedValueOnce({ url: 'http://127.0.0.1:4000/new', token: 'new-token' });
    const unregisterFile = vi
      .spyOn(previewFileServer, 'unregisterFile')
      .mockResolvedValue(undefined);
    const provider = new PdfPreviewProvider({ path: '/extension' } as never);
    const document = {
      uri: { fsPath: '/docs/book.pdf', toString: () => 'file:///docs/book.pdf' },
    } as never;
    const oldPanel = createDocumentPanel();
    const newPanel = createDocumentPanel();

    await provider.resolveCustomEditor(document, oldPanel.panel as never, {} as never);
    await oldPanel.send({ type: 'ready' });
    await oldPanel.send({ type: 'ready' });
    await provider.resolveCustomEditor(document, newPanel.panel as never, {} as never);
    await newPanel.send({ type: 'ready' });

    expect(registerFile).toHaveBeenCalledTimes(2);
    oldPanel.dispose();
    await vi.waitFor(() => expect(unregisterFile).toHaveBeenCalledWith('old-token'));
    expect(unregisterFile).not.toHaveBeenCalledWith('new-token');
    expect(provider.navigateToPage(2, document.uri)).toBe(true);
    expect(newPanel.panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'document:navigate',
      payload: { locator: { kind: 'page', pageNumber: 2, pageIndex: 1 } },
    });

    provider.dispose();
    await vi.waitFor(() => expect(unregisterFile).toHaveBeenCalledWith('new-token'));
  });

  it('keeps document transport source free of Engine registration and fallback paths', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../providers/document/PreviewFileServer.ts'),
      'utf-8',
    );

    expect(source).not.toContain("from '@neko/neko-client'");
    expect(source).not.toContain('EngineClient');
    expect(source).not.toContain('neko.engine.ensureFrameServer');
    expect(source).not.toContain('/v1/preview/file/');
  });

  it('does not activate the Engine extension as a manifest dependency', () => {
    const manifest = require('../../../../package.json') as {
      readonly extensionDependencies?: readonly string[];
    };

    expect(manifest.extensionDependencies).toBeUndefined();
  });
});

function createDocumentPanel(): {
  readonly panel: Record<string, unknown>;
  send(message: unknown): Promise<void>;
  dispose(): void;
} {
  let messageHandler: ((message: unknown) => Promise<void>) | undefined;
  const disposeHandlers: Array<() => void> = [];
  const panel = {
    webview: {
      options: {},
      html: '',
      asWebviewUri: (uri: unknown) => uri,
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
    },
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: vi.fn() };
    }),
  };
  return {
    panel,
    async send(message) {
      if (!messageHandler) throw new Error('Document Webview message handler was not registered.');
      await messageHandler(message);
    },
    dispose() {
      if (disposeHandlers.length === 0) {
        throw new Error('Document Webview dispose handler was not registered.');
      }
      for (const handler of disposeHandlers) handler();
    },
  };
}

// ============================================================================
// Tests: HTML escaping (real production functions)
// ============================================================================

describe('getErrorHtml -- XSS prevention', () => {
  it('escapes <script> tags in error messages', () => {
    const html = getErrorHtml('<script>alert("xss")</script>');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;/script&gt;');
  });

  it('escapes ampersands and double-quotes', () => {
    const html = getErrorHtml('A & B "quoted"');

    expect(html).toContain('A &amp; B');
    expect(html).toContain('&quot;quoted&quot;');
  });

  it('escapes nested HTML injection attempts', () => {
    const html = getErrorHtml('"><img src=x onerror=alert(1)>');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;&gt;');
  });
});

describe('getUnresolvedVariableHtml -- file path escaping', () => {
  it('escapes angle brackets in file paths', () => {
    const html = getUnresolvedVariableHtml('MEDIA', '/foo/<bar>/baz');

    expect(html).toContain('&lt;bar&gt;');
    expect(html).not.toContain('>/foo/<bar>');
  });

  it('renders the variable name in the description', () => {
    const html = getUnresolvedVariableHtml('MY_LIB', '/some/path');

    expect(html).toContain('${MY_LIB}');
    expect(html).toContain('Media Library Not Configured');
  });

  it('renders setup instructions', () => {
    const html = getUnresolvedVariableHtml('ASSETS', '/x');

    expect(html).toContain('neko/settings.json');
    expect(html).toContain('neko-assets');
  });
});

// ============================================================================
// Tests: UnresolvedPathVariableError (real production class)
// ============================================================================

describe('UnresolvedPathVariableError', () => {
  it('stores variable and originalPath', () => {
    const err = new UnresolvedPathVariableError('MEDIA', '/${MEDIA}/file.pdf');

    expect(err.variable).toBe('MEDIA');
    expect(err.originalPath).toBe('/${MEDIA}/file.pdf');
    expect(err.name).toBe('UnresolvedPathVariableError');
    expect(err.message).toContain('MEDIA');
  });
});

describe('PreviewFileServer path resolution fallback', () => {
  it('resolves relative preview paths from the source document owning workspace', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-preview-path-'));
    const workspaceA = path.join(root, 'workspace-a');
    const workspaceB = path.join(root, 'workspace-b');
    fs.mkdirSync(path.join(workspaceB, 'cases'), { recursive: true });
    fs.writeFileSync(path.join(workspaceB, 'cases', 'book.epub'), '');
    workspaceFolders.push({ uri: { fsPath: workspaceA } }, { uri: { fsPath: workspaceB } });
    executeCommand.mockResolvedValueOnce(undefined);
    readFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === path.join(workspaceA, 'neko/settings.json') ||
        filePath === path.join(workspaceB, 'neko/settings.json')
      ) {
        return JSON.stringify({ mediaLibraries: [] });
      }
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw error;
    });

    try {
      await expect(
        resolvePreviewPath('cases/book.epub', {
          sourceDocumentUri: {
            scheme: 'file',
            fsPath: path.join(workspaceB, 'books/source.nkc'),
            path: path.join(workspaceB, 'books/source.nkc'),
            toString: () => `file://${path.join(workspaceB, 'books/source.nkc')}`,
          } as never,
        }),
      ).resolves.toBe(path.join(workspaceB, 'cases/book.epub'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves a workspace-linked document through the shared Host content path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-preview-linked-document-'));
    const workspaceRoot = path.join(root, 'workspace');
    const target = path.join(root, 'target');
    const linkPath = path.join(workspaceRoot, 'neko', 'assets', 'Books');
    const linkedFile = path.join(linkPath, 'book.epub');
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.writeFileSync(path.join(target, 'book.epub'), 'archive');
    fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    workspaceFolders.push({ uri: { fsPath: workspaceRoot } });

    try {
      const resolved = await (
        previewFileServer as unknown as { resolvePath: (filePath: string) => Promise<string> }
      ).resolvePath('neko/assets/Books/book.epub');
      expect(resolved).toBe(linkedFile);
      expect(getExtension).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects retired media-library variables without consulting Assets mappings', async () => {
    workspaceFolders.push({ uri: { fsPath: '/workspace-a' } });
    await expect(
      (
        previewFileServer as unknown as { resolvePath: (filePath: string) => Promise<string> }
      ).resolvePath('${BOOKS}/epub/book.epub'),
    ).rejects.toBeInstanceOf(UnresolvedPathVariableError);
    expect(getExtension).not.toHaveBeenCalled();
  });
});

describe('document viewer locator emission contracts', () => {
  it('keeps viewer send-to-agent paths on structured locators', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '../../../webview/src');
    const pdf = fs.readFileSync(path.join(root, 'shared/useDocumentSelection.ts'), 'utf-8');
    const epub = fs.readFileSync(path.join(root, 'epub/EpubViewer.tsx'), 'utf-8');
    const cbz = fs.readFileSync(path.join(root, 'cbz/CbzViewer.tsx'), 'utf-8');
    const docx = fs.readFileSync(path.join(root, 'docx/DocxViewer.tsx'), 'utf-8');

    expect(pdf).toContain("kind: 'page'");
    expect(pdf).toContain("kind: 'region'");
    expect(epub).toContain("kind: 'chapter'");
    expect(epub).toContain('chapterHref');
    expect(epub).toContain('spineIndex');
    expect(cbz).toContain('entryName');
    expect(cbz).toContain('const getPageLocator = useCallback');
    expect(docx).toContain("kind: 'text-range'");
    expect(docx).toContain('resolveDocxSelectionLocator');
    expect(docx).toContain('endChar');
  });
});
